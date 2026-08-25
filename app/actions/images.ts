'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { revalidatePath } from 'next/cache';
import { getToken } from './auth';

const execFileAsync = promisify(execFile);
const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || 'unikraft';
const TEMP_IMAGE_PATTERN = /(?:^|\/)\d{10,}(?::[^/]+)?$/;
const IMAGE_METROS = ['dal', 'sfo', 'was', 'fra', 'sin'] as const;

export interface TemporaryImage { reference: string; metro: string; size: string; createdAt: string }

function env(token: string): NodeJS.ProcessEnv {
  return { ...process.env, UKC_TOKEN: token };
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

function normalize(row: Record<string, unknown>, metro: string): TemporaryImage | null {
  const repository = text(row.repository || row.name || row.image || row.reference);
  const tag = text(row.tag);
  const reference = tag && !repository.endsWith(`:${tag}`) ? `${repository}:${tag}` : repository;
  if (!reference || !TEMP_IMAGE_PATTERN.test(reference)) return null;
  return { reference, metro, size: text(row.size || row.size_bytes || row.bytes) || '-', createdAt: text(row.created_at || row.createdAt || row.created) || '-' };
}

function parseTable(output: string, metro: string): TemporaryImage[] {
  const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, '');
  return plainOutput.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^([^\s]+\/\d{10,})\s+(\S+)\s+(.+)$/);
    if (!match) return [];
    return [{ reference: `${match[1]}:${match[2]}`, metro, size: match[3].trim(), createdAt: '-' }];
  });
}

export async function listTemporaryImages(): Promise<{ images: TemporaryImage[]; error?: string }> {
  const token = await getToken();
  if (!token) return { images: [], error: 'Unauthorized' };
  try {
    const results = await Promise.all(IMAGE_METROS.map(async (metro) => {
      try {
        const { stdout } = await execFileAsync(UNIKRAFT_CLI, ['image', 'list', '--metro', metro], { env: env(token), maxBuffer: 5 * 1024 * 1024 });
        try {
          const images = normalizeRows(JSON.parse(stdout)).map((row) => normalize(row, metro)).filter((image): image is TemporaryImage => image !== null);
          return images.length > 0 ? images : parseTable(stdout, metro);
        } catch { return parseTable(stdout, metro); }
      } catch { return []; }
    }));
    return { images: results.flat() };
  } catch (error) {
    return { images: [], error: error instanceof Error ? error.message : 'Unable to list images.' };
  }
}

export async function deleteTemporaryImage(reference: string, metro: string): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!TEMP_IMAGE_PATTERN.test(reference)) return { error: 'Only temporary images can be deleted.' };
  if (!IMAGE_METROS.includes(metro as (typeof IMAGE_METROS)[number])) return { error: 'Invalid metro.' };
  try {
    await execFileAsync(
      UNIKRAFT_CLI,
      ['image', 'remove', '--metro', metro, reference],
      { env: env(token), maxBuffer: 5 * 1024 * 1024, timeout: 120000 },
    );
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
