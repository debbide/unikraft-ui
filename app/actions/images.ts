'use server';

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { revalidatePath } from 'next/cache';
import { getToken } from './auth';

const execFileAsync = promisify(execFile);
const TEMP_IMAGE_PATTERN = /(?:^|\/)\d{10,}(?::[^/]+)?$/;

function deleteImage(reference: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('kraft', ['cloud', 'image', 'delete', reference], { env: env(token) });
    const timeout = setTimeout(() => child.kill(), 120000);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      const error = new Error(`kraft cloud image delete exited with code ${code}`) as Error & { stdout: string; stderr: string };
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
    child.stdin.write('y\n');
    child.stdin.end();
  });
}

export interface TemporaryImage { reference: string; size: string; createdAt: string }

function env(token: string): NodeJS.ProcessEnv {
  return { ...process.env, KRAFTCLOUD_TOKEN: token, KRAFTKIT_NO_WARN_CLOUD_DEPRECATION: '1' };
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['images', 'items', 'data']) if (Array.isArray(record[key])) return normalizeRows(record[key]);
  }
  return [];
}

function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

function normalize(row: Record<string, unknown>): TemporaryImage | null {
  const repository = text(row.repository || row.name || row.image || row.reference);
  const tag = text(row.tag);
  const reference = tag && !repository.endsWith(`:${tag}`) ? `${repository}:${tag}` : repository;
  if (!reference || !TEMP_IMAGE_PATTERN.test(reference)) return null;
  return { reference, size: text(row.size || row.size_bytes || row.bytes) || '-', createdAt: text(row.created_at || row.createdAt || row.created) || '-' };
}

function parseTable(output: string): TemporaryImage[] {
  const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, '');
  return plainOutput.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^([^\s]+\/\d{10,})\s+(\S+)\s+(.+)$/);
    if (!match) return [];
    return [{ reference: `${match[1]}:${match[2]}`, size: match[3].trim(), createdAt: '-' }];
  });
}

export async function listTemporaryImages(): Promise<{ images: TemporaryImage[]; error?: string }> {
  const token = await getToken();
  if (!token) return { images: [], error: 'Unauthorized' };
  try {
    const { stdout } = await execFileAsync('kraft', ['cloud', 'image', 'ls'], { env: env(token), maxBuffer: 5 * 1024 * 1024 });
    try {
      const images = normalizeRows(JSON.parse(stdout)).map(normalize).filter((image): image is TemporaryImage => image !== null);
      return { images: images.length > 0 ? images : parseTable(stdout) };
    } catch {
      return { images: parseTable(stdout) };
    }
  } catch (error) {
    return { images: [], error: error instanceof Error ? error.message : 'Unable to list images.' };
  }
}

export async function deleteTemporaryImage(reference: string): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!TEMP_IMAGE_PATTERN.test(reference)) return { error: 'Only temporary images can be deleted.' };
  try {
    await deleteImage(reference, token);
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
