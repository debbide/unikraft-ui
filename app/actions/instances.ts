"use server";

import { fetchUnikraft } from '@/lib/unikraft/client';
import { getToken } from './auth';
import { revalidatePath } from 'next/cache';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

async function runUnikraft(image: string, token: string, metro: string, portsRaw: string, formData: FormData): Promise<void> {
  if (/[\r\n]/.test(image)) throw new Error('Invalid Docker image reference.');
  const port = portsRaw.split('\n').map((value) => value.trim()).find(Boolean);
  if (!port) throw new Error('At least one published port is required.');

  const publish = port.replace(/^(\d+):(\d+)$/, '$1:$2/http+tls');
  const memory = Number(formData.get('memory_mb') || 512);
  const vcpus = Number(formData.get('vcpu') || 1);
  const name = String(formData.get('name') || '').trim();
  const disk = Number(formData.get('disk_mb') || 0);
  const volumeAt = String(formData.get('volume_at') || '/data').trim();
  const args = ['--config', '', 'run', '--metro', metro, '--publish', publish, '--image', image, '--memory', `${memory}MiB`, '--vcpus', String(vcpus), '--autostart'];
  if (name) args.push('--name', name);
  const envRaw = String(formData.get('env') || '');
  envRaw.split('\n').map((value) => value.trim()).filter(Boolean).forEach((value) => args.push('--env', value));
  if (disk > 0) {
    const sizeGiB = Math.max(1, Math.ceil(disk / 1024));
    args.push('--set', `volumes.0.at=${volumeAt}`);
    args.push('--set', `volumes.0.size=${sizeGiB}GiB`);
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const tokenPath = path.join(dir, 'token');
  const configPath = path.join(dir, 'config');
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  try {
    const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
    await execFileAsync('unikraft', ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    const { stdout, stderr } = await execFileAsync(
      'unikraft',
      args.map((arg) => arg === '' ? configPath : arg),
      { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
    );
    console.log(`[Unikraft] run stdout: ${stdout}`);
    if (stderr) console.error(`[Unikraft] run stderr: ${stderr}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function deployInstance(prevState: any, formData: FormData) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };

  const image = String(formData.get('image') || '');
  const metro = String(formData.get('metro') || '');
  const portsRaw = String(formData.get('ports') || '');
  if (!image || !metro) return { error: 'Image and Metro are required.' };

  if (!image.startsWith('unikraft.io') && !image.startsWith('index.unikraft.io')) {
    try {
      await runUnikraft(image, token, metro, portsRaw, formData);
      revalidatePath('/dashboard/instances');
      return { success: true };
    } catch (error) {
      const details = [
        error instanceof Error ? error.message : '',
        typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout || '') : '',
        typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr || '') : '',
      ].filter(Boolean).join('\n').trim();
      return { error: `Unikraft 部署失败: ${details}` };
    }
  }

  const finalImage = image.startsWith('unikraft.io') ? `index.${image}` : image;
  const response = await fetchUnikraft<{ error?: string }>(
    '/v1/instances', token,
    { method: 'POST', body: JSON.stringify({ image: finalImage, memory_mb: Number(formData.get('memory_mb') || 512), vcpus: Number(formData.get('vcpu') || 1), autostart: true }) },
    metro,
  );
  if (response.error) return { error: response.error };
  revalidatePath('/dashboard/instances');
  return { success: true };
}

export async function deleteInstance(uuid: string, metro: string) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  await fetchUnikraft('/v1/instances/' + encodeURIComponent(uuid), token, { method: 'DELETE' }, metro);
  revalidatePath('/dashboard/instances');
  return { success: true };
}
