'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { revalidatePath } from 'next/cache';
import { getToken } from './auth';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);
const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || 'unikraft';
const TEMP_IMAGE_PATTERN = /(?:^|\/)(?:\d{10,}|docker-\d{10,}|converted-[^/:]+)(?::[^/]+)?$/;

export interface TemporaryImage { reference: string; metro: string; size: string; createdAt: string }

function commandDetails(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr || '') : '';
  return [message, stderr].filter(Boolean).join('\n').trim() || fallback;
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
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(normalizeRows);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const rows = typeof record.ref === 'string' ? [record] : [];
    return rows.concat(Object.values(record).flatMap(normalizeRows));
  }
  return [];
}

function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

function normalize(row: Record<string, unknown>, metro: string): TemporaryImage | null {
  const repository = text(row.ref || row.repository || row.name || row.image || row.reference);
  const tag = text(row.tag);
  const reference = tag && !repository.endsWith(`:${tag}`) ? `${repository}:${tag}` : repository;
  if (!reference || !TEMP_IMAGE_PATTERN.test(reference)) return null;
  return { reference, metro, size: text(row.size || row.size_bytes || row.bytes) || '-', createdAt: text(row.created_at || row.createdAt || row.created) || '-' };
}

function parseTable(output: string, metro: string): TemporaryImage[] {
  const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, '');
  return plainOutput.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^([^\s]+)\s+(.+)$/);
    if (!match) return [];
    const reference = match[1].includes(':') ? match[1] : `${match[1]}:latest`;
    if (!TEMP_IMAGE_PATTERN.test(reference)) return [];
    return [{ reference, metro, size: match[2].trim(), createdAt: '-' }];
  });
}

export async function listTemporaryImages(): Promise<{ images: TemporaryImage[]; error?: string }> {
  const token = await getToken();
  if (!token) return { images: [], error: 'Unauthorized' };
  try {
    return await withLogin(token, async (configPath, env) => {
      const { stdout } = await execFileAsync(UNIKRAFT_CLI, ['--config', configPath, 'image', 'list', '--output', 'json'], { env, maxBuffer: 5 * 1024 * 1024 });
      try {
        const images = normalizeRows(JSON.parse(stdout)).map((row) => normalize(row, '-')).filter((image): image is TemporaryImage => image !== null);
        return { images: images.length > 0 ? images : parseTable(stdout, '-') };
      } catch { return { images: parseTable(stdout, '-') }; }
    });
  } catch (error) {
    return { images: [], error: error instanceof Error ? error.message : 'Unable to list images.' };
  }
}

export async function deleteTemporaryImage(reference: string, metro: string): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!TEMP_IMAGE_PATTERN.test(reference)) return { error: 'Only temporary images can be deleted.' };
  try {
    await withLogin(token, (configPath, env) => execFileAsync(
      UNIKRAFT_CLI,
      ['--config', configPath, 'image', 'delete', reference],
      { env, maxBuffer: 5 * 1024 * 1024, timeout: 120000 },
    ).then(() => undefined));
    revalidatePath('/dashboard/images');
    return { success: true };
  } catch (error) {
    const details = [
      error instanceof Error ? error.message : '',
      typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout || '') : '',
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr || '') : '',
    ].filter(Boolean).join('\n').trim();
    return { error: details || 'Unable to delete image.' };
  }
}

export async function convertDockerImage(
  _previousState: { success?: true; error?: string } | null,
  formData: FormData,
): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  const image = String(formData.get('image') || '').trim();
  if (!image || /[\r\n]/.test(image) || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(image)) {
    return { error: '请输入有效的 Docker 镜像引用。' };
  }

  try {
    void withLogin(token, async (configPath, env) => {
      await execFileAsync('docker', ['pull', image], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
      const inspect = await execFileAsync('docker', ['image', 'inspect', image], { env, maxBuffer: 5 * 1024 * 1024 });
      const metadata = JSON.parse(inspect.stdout)[0]?.Config || {};
      const command = [...(Array.isArray(metadata.Entrypoint) ? metadata.Entrypoint : []), ...(Array.isArray(metadata.Cmd) ? metadata.Cmd : [])];
      if (command.length === 0) throw new Error('Docker 镜像没有 Entrypoint 或 Cmd。');
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-convert-'));
      try {
        await fs.writeFile(path.join(dir, 'Dockerfile'), `FROM ${image}\n`);
        await fs.writeFile(path.join(dir, 'Kraftfile'), [
          'spec: v0.7', '', 'runtime: base-compat:latest', '', 'rootfs:',
          '  source:', '    path: ./Dockerfile', '    type: dockerfile', '  format: erofs', '',
          `cmd: ${JSON.stringify(command)}`,
        ].join('\n'));
        const namespace = process.env.UNIKRAFT_IMAGE_NAMESPACE || 'dghdnk';
        const imageName = image.split('/').pop()?.replace(/[^a-zA-Z0-9_.-]/g, '-') || 'app';
        const output = `${namespace}/converted-${imageName}:latest`;
        await execFileAsync('unikraft', ['--config', configPath, 'build', dir, '--output', output], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }).then(() => revalidatePath('/dashboard/images')).catch((error) => console.error('[Unikraft] image conversion failed:', error));
    return { success: true };
  } catch (error) {
    return { error: commandDetails(error, '转换任务启动失败。') };
  }
}
