'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { fetchUnikraft } from '@/lib/unikraft/client';
import { getToken } from './auth';

const execFileAsync = promisify(execFile);

type VolumeActionState = {
  success?: true;
  error?: string;
};

function getCommandError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  const stderr =
    typeof error === 'object' && error !== null && 'stderr' in error
      ? String(error.stderr || '')
      : '';

  return [message, stderr].filter(Boolean).join('\n').trim() || fallback;
}

export async function createVolume(
  _previousState: VolumeActionState | null,
  formData: FormData,
): Promise<VolumeActionState> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };

  const name = String(formData.get('name') || '').trim();
  const metro = String(formData.get('metro') || '').trim();
  const size = String(formData.get('size') || '').trim();

  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name) ||
    !/^[a-z]{3}$/.test(metro) ||
    !/^\d+(?:M|G|MiB|GiB)$/.test(size)
  ) {
    return { error: '存储卷参数无效。' };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-volume-'));
  const tokenPath = path.join(dir, 'token');
  const configPath = path.join(dir, 'config');
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };

  await fs.writeFile(tokenPath, token, { mode: 0o600 });

  try {
    await execFileAsync(
      'unikraft',
      ['--config', configPath, 'login', '--no-browser', '--token', tokenPath],
      { env, timeout: 120000 },
    );
    await execFileAsync(
      'unikraft',
      [
        '--config',
        configPath,
        'volumes',
        'create',
        '--metro',
        metro,
        '--name',
        name,
        '--size',
        size,
      ],
      { env, timeout: 120000 },
    );
    revalidatePath('/dashboard/volumes');
    return { success: true };
  } catch (error) {
    return { error: getCommandError(error, '无法创建存储卷。') };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function deleteVolume(name: string, metro: string): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name) || !/^[a-z]{3}$/.test(metro)) return { error: 'Invalid volume.' };
  try {
    await fetchUnikraft(`/v1/volumes/${encodeURIComponent(name)}`, token, { method: 'DELETE' }, metro);
    revalidatePath('/dashboard/volumes');
    return { success: true };
  } catch (error) {
    return { error: getCommandError(error, '无法删除存储卷。') };
  }
}
