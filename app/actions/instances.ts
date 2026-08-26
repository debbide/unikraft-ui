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

function imageReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(imageReferences);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return (typeof record.ref === 'string' ? [record.ref] : []).concat(Object.values(record).flatMap(imageReferences));
}

async function cleanupGeneratedImages(configPath: string, env: NodeJS.ProcessEnv, namespace: string): Promise<void> {
  const { stdout } = await execFileAsync('unikraft', ['--config', configPath, 'image', 'list', '--output', 'json'], { env, timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
  const references = imageReferences(JSON.parse(stdout)).filter((reference) => {
    const name = reference.replace(/^unikraft\.io\//, '');
    return name.startsWith(`${namespace}/converted-`) || new RegExp(`^${namespace}/(?:docker-)?\\d{10,}(?::|@|$)`).test(name);
  });
  await Promise.all(references.map((reference) => execFileAsync('unikraft', ['--config', configPath, 'image', 'delete', reference], { env, timeout: 120000 }).catch(() => undefined)));
}

async function runUnikraft(image: string, token: string, metro: string, portsRaw: string, formData: FormData): Promise<void> {
  if (/[\r\n]/.test(image)) throw new Error('Invalid Docker image reference.');
  const ports = portsRaw.split('\n').map((value) => value.trim()).filter(Boolean);
  if (ports.length === 0) throw new Error('At least one published port is required.');
  const memory = Number(formData.get('memory_mb') || 512);
  const vcpus = Number(formData.get('vcpu') || 1);
  const name = String(formData.get('name') || '').trim();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const tokenPath = path.join(dir, 'token');
  const configPath = path.join(dir, 'config');
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  try {
    const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
    await execFileAsync('unikraft', ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    await execFileAsync('docker', ['pull', image], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
    const inspect = await execFileAsync('docker', ['image', 'inspect', image], { env, maxBuffer: 5 * 1024 * 1024 });
    const metadata = JSON.parse(inspect.stdout)[0]?.Config || {};
    const command = [...(Array.isArray(metadata.Entrypoint) ? metadata.Entrypoint : []), ...(Array.isArray(metadata.Cmd) ? metadata.Cmd : [])];
    if (command.length === 0) throw new Error('Docker image has no Entrypoint or Cmd.');
    await fs.writeFile(path.join(dir, 'Dockerfile'), `FROM ${image}\n`);
    await fs.writeFile(path.join(dir, 'Kraftfile'), [
      'spec: v0.7', '', 'runtime: base-compat:latest', '', 'rootfs:',
      '  source:', '    path: ./Dockerfile', '    type: dockerfile',
      '  format: erofs', '', `cmd: ${JSON.stringify(command)}`,
    ].join('\n'));
    const namespace = process.env.UNIKRAFT_IMAGE_NAMESPACE || 'dghdnk';
    const imageName = image.split('/').pop()?.replace(/[^a-zA-Z0-9_.-]/g, '-') || 'app';
    const output = `${namespace}/converted-${imageName}:latest`;
    const outputRef = `unikraft.io/${output}`;
    await execFileAsync('unikraft', ['--config', configPath, 'image', 'delete', outputRef], { env, timeout: 120000 }).catch(() => undefined);
    await cleanupGeneratedImages(configPath, env, namespace);
    await execFileAsync('unikraft', ['--config', configPath, 'build', dir, '--output', output], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
    const args = ['--config', configPath, 'run', '--metro', metro, '--image', output, '--memory', `${memory}MiB`, '--vcpus', String(vcpus), '--scale-to-zero', 'policy=off', '--autostart'];
    ports.forEach((port) => args.push('--publish', port));
    if (name) args.push('--name', name);
    const envRaw = String(formData.get('env') || '');
    envRaw.split('\n').map((value) => value.trim()).filter(Boolean).forEach((value) => args.push('--env', value));
    const volumeName = String(formData.get('volume_name') || '').trim();
    if (volumeName) {
      const volumeAt = String(formData.get('volume_at') || '/data').trim();
      if (!volumeAt.startsWith('/') || /[\r\n]/.test(volumeAt)) throw new Error('Invalid volume mount path.');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(volumeName)) throw new Error('Invalid volume name.');
      args.push('--volume', `${volumeName}:${volumeAt}`);
    }
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
      void runUnikraft(image, token, metro, portsRaw, formData)
        .then(() => revalidatePath('/dashboard/instances'))
        .catch((error) => console.error('[Unikraft] background deployment failed:', error));
      return { success: true, message: '部署任务已在后台开始，完成后请刷新实例列表。' };
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
