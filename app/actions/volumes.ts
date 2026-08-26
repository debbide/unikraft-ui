'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getToken } from './auth';

const execFileAsync = promisify(execFile);

export async function deleteVolume(name: string, metro: string): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name) || !/^[a-z]{3}$/.test(metro)) return { error: 'Invalid volume.' };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-volume-'));
  const tokenPath = path.join(dir, 'token');
  const configPath = path.join(dir, 'config');
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  try {
    await execFileAsync('unikraft', ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    await execFileAsync('unikraft', ['--config', configPath, 'volumes', 'delete', name, '--metro', metro], { env, timeout: 120000 });
    revalidatePath('/dashboard/volumes');
    return { success: true };
  } catch (error) {
    const details = [error instanceof Error ? error.message : '', typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr || '') : ''].filter(Boolean).join('\n').trim();
    return { error: details || 'Unable to delete volume.' };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
