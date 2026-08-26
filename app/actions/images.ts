'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getToken } from './auth';
import { createJob, findActiveJob, listJobs } from '@/lib/image-conversion/jobs';
import { enqueueConversion, enqueueJob, recoverJobs } from '@/lib/image-conversion/worker';
import type { ConversionJob } from '@/lib/image-conversion/types';

const execFileAsync = promisify(execFile);
const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || 'unikraft';
const TEMP_IMAGE_PATTERN = /(?:^|\/)(?:\d{10,}|docker-\d{10,}|converted-[^/:]+)(?::[^/]+)?$/;

export interface TemporaryImage { reference: string; metro: string; size: string; createdAt: string }

function commandDetails(error: unknown, fallback: string) {
  const item = error as { message?: string; stderr?: string };
  return [item.message, item.stderr].filter(Boolean).join('\n').trim() || fallback;
}

async function withLogin<T>(token: string, action: (configPath: string, env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const tokenPath = path.join(dir, 'token');
  const configPath = path.join(dir, 'config');
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  try {
    await execFileAsync(UNIKRAFT_CLI, ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    return await action(configPath, env);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(normalizeRows);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const isImage = ['ref', 'url', 'repository', 'name', 'image', 'reference'].some((key) => typeof record[key] === 'string');
    return (isImage ? [record] : []).concat(Object.values(record).flatMap(normalizeRows));
  }
  return [];
}
function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function isMetroIndexReference(reference: string) { return /^index\.[a-z0-9-]+\.unikraft\.cloud\//i.test(reference.replace(/^oci:\/\//, '').trim()); }
function dedupeImages(images: TemporaryImage[]) { return Array.from(new Map(images.map((image) => [image.reference, image])).values()); }
function normalize(row: Record<string, unknown>, metro: string): TemporaryImage | null {
  const repository = text(row.ref || row.url || row.repository || row.name || row.image || row.reference).replace(/^oci:\/\//, '').trim();
  if (isMetroIndexReference(repository)) return null;
  const tag = text(row.tag);
  const reference = tag && !repository.endsWith(`:${tag}`) ? `${repository}:${tag}` : repository;
  if (!reference || !TEMP_IMAGE_PATTERN.test(reference)) return null;
  return { reference, metro, size: text(row.size_in_bytes || row.size_bytes || row.size || row.bytes) || '-', createdAt: text(row.created_at || row.createdAt || row.created) || '-' };
}
function parseTable(output: string, metro: string): TemporaryImage[] {
  return output.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^([^\s]+)\s+(.+)$/);
    if (!match) return [];
    const reference = match[1].replace(/^oci:\/\//, '');
    const taggedReference = reference.includes(':') || reference.includes('@') ? reference : `${reference}:latest`;
    return !isMetroIndexReference(reference) && TEMP_IMAGE_PATTERN.test(taggedReference) ? [{ reference: taggedReference, metro, size: '-', createdAt: '-' }] : [];
  });
}

async function enrichImageSizes(
  images: TemporaryImage[],
  configPath: string,
  env: NodeJS.ProcessEnv,
): Promise<TemporaryImage[]> {
  return Promise.all(images.map(async (image) => {
    if (image.size !== '-') return image;
    try {
      const { stdout } = await execFileAsync(
        UNIKRAFT_CLI,
        ['--config', configPath, 'image', 'get', image.reference, '--output', 'json'],
        { env, maxBuffer: 1024 * 1024, timeout: 120000 },
      );
      const rows = normalizeRows(JSON.parse(stdout));
      const details = rows[0];
      const size = details ? text(details.size_in_bytes || details.size_bytes || details.size || details.bytes) : '';
      return size ? { ...image, size } : image;
    } catch {
      return image;
    }
  }));
}

export async function listTemporaryImages(options?: { includeSizes?: boolean }): Promise<{ images: TemporaryImage[]; error?: string }> {
  const token = await getToken();
  if (!token) return { images: [], error: 'Unauthorized' };
  try { return await withLogin(token, async (configPath, env) => {
    const { stdout } = await execFileAsync(UNIKRAFT_CLI, ['--config', configPath, 'image', 'list', '--output', 'json'], { env, maxBuffer: 5 * 1024 * 1024 });
    try {
      const images = normalizeRows(JSON.parse(stdout)).map((row) => normalize(row, '-')).filter((image): image is TemporaryImage => image !== null);
      const listed = dedupeImages(images.length ? images : parseTable(stdout, '-'));
      return { images: options?.includeSizes === false ? listed : await enrichImageSizes(listed, configPath, env) };
    } catch {
      const listed = dedupeImages(parseTable(stdout, '-'));
      return { images: options?.includeSizes === false ? listed : await enrichImageSizes(listed, configPath, env) };
    }
  }); } catch (error) { return { images: [], error: commandDetails(error, 'Unable to list images.') }; }
}

export async function deleteTemporaryImage(reference: string, _metro: string): Promise<{ success?: true; error?: string }> {
  void _metro;
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!TEMP_IMAGE_PATTERN.test(reference)) return { error: 'Only temporary images can be deleted.' };
  try {
    await withLogin(token, (configPath, env) => execFileAsync(UNIKRAFT_CLI, ['--config', configPath, 'image', 'delete', reference], { env, maxBuffer: 5 * 1024 * 1024, timeout: 120000 }).then(() => undefined));
    revalidatePath('/dashboard/images');
    return { success: true };
  } catch (error) { return { error: commandDetails(error, 'Unable to delete image.') }; }
}

export async function convertDockerImage(_previousState: { success?: true; error?: string; job?: ConversionJob } | null, formData: FormData): Promise<{ success?: true; error?: string; job?: ConversionJob }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  const image = String(formData.get('image') || '').trim();
  if (!image || /[\r\n]/.test(image) || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(image)) return { error: '请输入有效的 Docker 镜像引用。' };
  await recoverJobs();
  if (await findActiveJob(image)) return { error: '该镜像已有转换任务在队列中，请等待任务完成。' };
  const job = await createJob(image);
  enqueueConversion(job.id, token, image);
  revalidatePath('/dashboard/images');
  return { success: true, job };
}

export async function listConversionJobs(): Promise<{ jobs: ConversionJob[]; error?: string }> {
  if (!(await getToken())) return { jobs: [], error: 'Unauthorized' };
  try { return { jobs: await listJobs() }; } catch (error) { return { jobs: [], error: commandDetails(error, '无法读取转换任务。') }; }
}

export async function retryConversionJob(id: string): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  const job = (await listJobs()).find((item) => item.id === id);
  if (!job || job.status !== 'failed') return { error: '只能重试失败的转换任务。' };
  const replacement = await createJob(job.sourceImage);
  enqueueJob(replacement.id, token, replacement.sourceImage);
  revalidatePath('/dashboard/images');
  return { success: true };
}