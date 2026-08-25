"use server";

import { fetchUnikraft } from '@/lib/unikraft/client';
import { getToken } from './auth';
import { revalidatePath } from 'next/cache';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || 'unikraft';

async function convertDockerToUnikraft(image: string, token: string, metro: string, memory_mb: number, vcpu: number, name: string, envRaw: string, portsRaw: string, disk_mb: number, volume_at: string): Promise<void> {
  let isWsl = false;
  try {
    await execAsync(`${UNIKRAFT_CLI} version`);
  } catch (e) {
    try {
      await execAsync(`wsl ${UNIKRAFT_CLI} version`);
      isWsl = true;
    } catch (e2) {
      throw new Error('服务器环境缺失 kraft 工具，无法完成自动转码。');
    }
  }

  const tmpDir = path.join(process.cwd(), '.tmp-kraft', Date.now().toString());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    if (/[\r\n]/.test(image)) {
      throw new Error('Invalid Docker image reference.');
    }

    const dockerfile = `FROM ${image}\n`;
    const kraftfile = 'spec: v0.6\nruntime: base:latest\nrootfs: ./Dockerfile\n';
    await fs.writeFile(path.join(tmpDir, 'Dockerfile'), dockerfile);
    await fs.writeFile(path.join(tmpDir, 'Kraftfile'), kraftfile);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      KRAFTCLOUD_TOKEN: token,
      WSLENV: 'KRAFTCLOUD_TOKEN/u'
    };
    
    // 我们设置不警告 deprecated 否则会污染输出
    env.KRAFTKIT_NO_WARN_CLOUD_DEPRECATION = '1';

    let deployCmd = `${UNIKRAFT_CLI} cloud deploy --timeout 30m --metro ${metro} -M ${memory_mb} -V ${vcpu}`;
    if (name) deployCmd += ` --name ${name}`;
    
    if (portsRaw) {
      portsRaw.split('\n').map(p => p.trim()).filter(Boolean).forEach(p => {
        deployCmd += ` -p ${p}`;
      });
    }
    if (envRaw) {
      envRaw.split('\n').map(e => e.trim()).filter(Boolean).forEach(e => {
        deployCmd += ` -e "${e}"`;
      });
    }
    if (disk_mb > 0) {
      deployCmd += ` -v ${volume_at}:${disk_mb}`;
    }

    const cmd = isWsl ? `wsl ${deployCmd} .` : `${deployCmd} .`;

    console.log(`[Auto-Convert] 正在使用 kraft cloud deploy 一键部署... 命令: ${cmd}`);

    const { stdout, stderr } = await execAsync(cmd, { 
      cwd: tmpDir, 
      env,
      timeout: 30 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    });

    console.log(`[Auto-Convert] 一键部署成功! stdout: ${stdout}`);

  } catch (error: any) {
    const details = [error.message, error.stdout, error.stderr]
      .filter((value): value is string => Boolean(value))
      .join('\n')
      .trim();
    console.error(`[Auto-Convert] deploy failed:\n${details}`);
    throw new Error(`自动转码 Docker 镜像失败: ${details}`);
    console.error(`[Auto-Convert] 转码部署失败:`, error.message);
    throw new Error(`自动转码 Docker 镜像失败: ${error.message}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function deployInstance(prevState: any, formData: FormData) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };

  const originalImage = formData.get('image') as string;
  const metro = formData.get('metro') as string;
  const memory_mb = parseInt(formData.get('memory_mb') as string || '512', 10);
  const vcpu = parseInt(formData.get('vcpu') as string || '1', 10);
  const disk_mb = parseInt(formData.get('disk_mb') as string || '0', 10);
  const volume_at = formData.get('volume_at') as string || '/data';
  const name = formData.get('name') as string;
  const envRaw = formData.get('env') as string;
  const portsRaw = formData.get('ports') as string;

  if (!originalImage || !metro) {
    return { error: 'Image and Metro are required.' };
  }

  // 1. 如果是原生 Docker 镜像，拦截，用 kraft cloud deploy 直接一步到位完成部署！
  if (!originalImage.startsWith('unikraft.io') && !originalImage.startsWith('index.unikraft.io')) {
    try {
      await convertDockerToUnikraft(originalImage, token, metro, memory_mb, vcpu, name, envRaw, portsRaw, disk_mb, volume_at);
      revalidatePath('/dashboard/instances');
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  // 2. 如果本身就是微内核镜像，走原本的 REST API 部署
  let finalImage = originalImage;
  if (finalImage.startsWith('unikraft.io')) {
    finalImage = 'index.' + finalImage;
  } else if (finalImage.includes('/') && !finalImage.includes('unikraft.io')) {
    finalImage = 'index.unikraft.io/' + finalImage;
  } else if (!finalImage.startsWith('index.unikraft.io')) {
    finalImage = 'index.unikraft.io/official/' + finalImage;
  }

  const payload: any = {
    image: finalImage,
    memory_mb,
    args: [],
    autostart: true,
  };

  if (name) payload.name = name;
  if (vcpu) payload.vcpus = vcpu;

  const envMap: Record<string, string> = {};
  if (envRaw) {
    envRaw.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v) envMap[k.trim()] = v.join('=').trim();
    });
  }
  if (Object.keys(envMap).length > 0) payload.env = envMap;

  if (disk_mb > 0) {
    payload.volumes = [{ size_mb: disk_mb, at: volume_at }];
  }

  if (portsRaw) {
    const serviceGroup: any = { domains: [], services: [] };
    portsRaw.split('\n').map(p => p.trim()).filter(Boolean).forEach(mapping => {
      const parts = mapping.split(':');
      if (parts.length === 2) {
        const dest = parseInt(parts[1], 10);
        serviceGroup.services.push({ port: parseInt(parts[0], 10), destination_port: dest, handlers: dest === 443 ? ['tls', 'http'] : ['http'] });
      }
    });
    if (serviceGroup.services.length > 0) {
      payload.service_group = serviceGroup;
    }
  }

  const response = await fetchUnikraft<{ error?: string }>(
    '/v1/instances',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    metro,
  );
  if (response.error) {
    return { error: response.error };
  }

  revalidatePath('/dashboard/instances');
  return { success: true };
}

export async function deleteInstance(uuid: string, metro: string) {
  const token = await getToken();
  if (!token) return { error: 'Unauthorized' };
  
  const response = await fetchUnikraft<{ error?: string }>(
    `/v1/instances/${encodeURIComponent(uuid)}`,
    token,
    { method: 'DELETE' },
    metro,
  );
  if (response.error) {
    return { error: response.error };
  }
  
  revalidatePath('/dashboard/instances');
  return { success: true };
}
