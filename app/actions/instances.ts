"use server";

import { fetchUnikraft } from '@/lib/unikraft/client';
import { getToken } from './auth';
import { revalidatePath } from 'next/cache';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function runUnikraft(image: string, token: string, metro: string, portsRaw: string): Promise<void> {
  if (/[\r\n]/.test(image)) throw new Error('Invalid Docker image reference.');
  const port = portsRaw.split('\n').map((value) => value.trim()).find(Boolean);
  if (!port) throw new Error('At least one published port is required.');

  const publish = port.replace(/^(\d+):(\d+)$/, '$1:$2/http+tls');
  const { stdout, stderr } = await execFileAsync(
    'unikraft',
    ['run', '--metro', metro, '--publish', publish, '--image', image],
    { env: { ...process.env, KRAFTCLOUD_TOKEN: token }, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
  );
  console.log(`[Unikraft] run stdout: ${stdout}`);
  if (stderr) console.error(`[Unikraft] run stderr: ${stderr}`);
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
      await runUnikraft(image, token, metro, portsRaw);
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
