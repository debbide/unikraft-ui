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

function isMetroIndexReference(image: string) {
  return /^index\.[a-z0-9-]+\.unikraft\.cloud\//i.test(image.replace(/^oci:\/\//, '').trim());
}

function normalizePublishedPort(value: string) {
  if (value.includes('/')) return value;
  const match = value.match(/^(\d+):(\d+)$/);
  if (!match) return value;
  return match[1] === '443' ? `${value}/http+tls` : match[1] === '80' ? `${value}/http` : value;
}

function parsePublishedPorts(formData: FormData) {
  const values = formData.getAll('ports').map(String).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new Error('至少需要填写一个开放端口。');
  const ports = values.map(normalizePublishedPort);
  for (const port of ports) {
    const match = port.match(/^(\d+):(\d+)\/(http|http\+tls|tls)$/);
    if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535 || Number(match[1]) < 1 || Number(match[2]) < 1) {
      throw new Error('端口格式无效，请填写 1-65535 范围内的端口并选择有效协议。');
    }
  }
  return ports;
}

function commandDetails(error: unknown) {
  return [
    error instanceof Error ? error.message : '',
    typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout || '') : '',
    typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr || '') : '',
  ].filter(Boolean).join('\n').trim();
}

function commandOutput(error: unknown) {
  const item = error as { stdout?: string; stderr?: string; message?: string };
  return [item.stdout, item.stderr, item.message].filter(Boolean).join('\n').trim();
}

export async function diagnoseInstance(uuid: string, metro: string, name: string) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!/^[a-z]{3}$/.test(metro) || !uuid || !name) return { error: '实例参数无效。' };

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-diagnose-'));
  const tokenPath = path.join(dir, 'token');
  const configPath = path.join(dir, 'config');
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  try {
    await fs.writeFile(tokenPath, token, { mode: 0o600 });
    await execFileAsync('unikraft', ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    const run = (args: string[], maxBuffer: number) => execFileAsync('unikraft', ['--config', configPath, ...args], { env, timeout: 120000, maxBuffer });
    const detailsResult = await run(['instances', 'get', uuid], 5 * 1024 * 1024).catch((error) => ({ error: commandOutput(error) }));
    const logsResult = await run(['instances', 'logs', name], 10 * 1024 * 1024).catch((error) => ({ error: commandOutput(error) }));
    return {
      details: 'stdout' in detailsResult ? `${detailsResult.stdout}${detailsResult.stderr || ''}`.trim() : '',
      logs: 'stdout' in logsResult ? `${logsResult.stdout}${logsResult.stderr || ''}`.trim() : '',
      detailsError: 'error' in detailsResult ? detailsResult.error : '',
      logsError: 'error' in logsResult ? logsResult.error : '',
    };
  } catch (error) {
    return { error: `获取诊断信息失败: ${commandDetails(error)}` };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function runConvertedImage(
  image: string,
  token: string,
  metro: string,
  formData: FormData,
) {
  if (isMetroIndexReference(image) || !CONVERTED_IMAGE_PATTERN.test(image)) {
    throw new Error('请选择临时镜像列表中的已转换镜像。');
  }
  const ports = parsePublishedPorts(formData);

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
  if (!image || !metro) return { error: '请选择已转换镜像和 Metro。' };

  try {
    await runConvertedImage(image, token, metro, formData);
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

export type InstanceLifecycleAction = 'start' | 'stop' | 'restart';

export async function changeInstanceState(
  uuid: string,
  metro: string,
  action: InstanceLifecycleAction,
) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  if (!uuid || !/^[a-z]{3}$/.test(metro)) return { error: '实例参数无效。' };

  try {
    await fetchUnikraft(
      `/v1/instances/${encodeURIComponent(uuid)}/${action}`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify(
          action === 'start'
            ? { timeout_s: 10 }
            : { force: false, drain_timeout_ms: 5000 },
        ),
      },
      metro,
    );
    revalidatePath('/dashboard/instances');
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '实例状态变更失败。',
    };
  }
}
