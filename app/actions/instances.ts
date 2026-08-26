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
const CONVERTED_IMAGE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*converted-[a-zA-Z0-9._-]+(?::[a-zA-Z0-9._-]+)?$/;

function commandDetails(error: unknown) {
  return [
    error instanceof Error ? error.message : '',
    typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout || '') : '',
    typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr || '') : '',
  ].filter(Boolean).join('\n').trim();
}

async function runConvertedImage(
  image: string,
  token: string,
  metro: string,
  portsRaw: string,
  formData: FormData,
) {
  if (!CONVERTED_IMAGE_PATTERN.test(image)) {
    throw new Error('请选择临时镜像列表中的已转换镜像。');
  }
  const ports = portsRaw.split('\n').map((value) => value.trim()).filter(Boolean);
  if (ports.length === 0) throw new Error('至少需要填写一个开放端口。');

  const memory = Number(formData.get('memory_mb') || 512);
  const vcpus = Number(formData.get('vcpu') || 1);
  const name = String(formData.get('name') || '').trim();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
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
    const args = [
      '--config', configPath, 'run', '--metro', metro, '--image', image,
      '--memory', `${memory}MiB`, '--vcpus', String(vcpus),
      '--scale-to-zero', 'policy=off', '--autostart',
    ];
    ports.forEach((port) => args.push('--publish', port));
    if (name) args.push('--name', name);
    String(formData.get('env') || '').split('\n').map((value) => value.trim()).filter(Boolean)
      .forEach((value) => args.push('--env', value));

    const requestedVolume = String(formData.get('volume_name') || '').trim();
    const volumeName = requestedVolume === '__none' ? '' : requestedVolume;
    if (volumeName) {
      const volumeAt = String(formData.get('volume_at') || '/data').trim();
      if (!volumeAt.startsWith('/') || /[\r\n]/.test(volumeAt)) throw new Error('挂载路径无效。');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(volumeName)) throw new Error('存储卷名称无效。');
      args.push('--volume', `${volumeName}:${volumeAt}`);
    }

    await execFileAsync('unikraft', args, {
      env,
      timeout: 10 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function deployInstance(_previousState: unknown, formData: FormData) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };

  const image = String(formData.get('image') || '').trim();
  const metro = String(formData.get('metro') || '').trim();
  const portsRaw = String(formData.get('ports') || '');
  if (!image || !metro) return { error: '请选择已转换镜像和 Metro。' };

  try {
    await runConvertedImage(image, token, metro, portsRaw, formData);
    revalidatePath('/dashboard/instances');
    return { success: true, message: '实例部署成功。' };
  } catch (error) {
    return { error: `Unikraft 部署失败: ${commandDetails(error)}` };
  }
}

export async function deleteInstance(uuid: string, metro: string) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  await fetchUnikraft('/v1/instances/' + encodeURIComponent(uuid), token, { method: 'DELETE' }, metro);
  revalidatePath('/dashboard/instances');
  return { success: true };
}
