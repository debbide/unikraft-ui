import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createJobLogger, updateJob } from './jobs';
import { runCommand } from './command';

const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || 'unikraft';
const DEFAULT_RUNTIME = process.env.UNIKRAFT_RUNTIME || 'base-compat:latest';
export const SUPPORTED_RUNTIMES = [
  'base-compat:latest',
  'ghcr.io/cokear/base-compat-fix:v3',
] as const;

function imageSummary(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  const summary = rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const platform = row.platform && typeof row.platform === 'object'
      ? row.platform as Record<string, unknown>
      : {};
    const kernel = row.kernel && typeof row.kernel === 'object'
      ? row.kernel as Record<string, unknown>
      : {};
    const initrd = row.initrd && typeof row.initrd === 'object'
      ? row.initrd as Record<string, unknown>
      : {};
    return [`platform=${String(platform.os || 'unknown')}/${String(platform.architecture || 'unknown')}`
      + `${platform.variant ? `/${String(platform.variant)}` : ''}`
      + ` kernel=${kernel.digest || kernel.size ? JSON.stringify(kernel) : 'missing'}`
      + ` initrd=${initrd.digest || initrd.size ? JSON.stringify(initrd) : 'missing'}`];
  });
  return summary.length ? summary.join('\n') : '未解析到镜像平台信息。';
}

function shellQuote(value: string) { return `'${value.replace(/'/g, `'\\''`)}'`; }
function details(error: unknown) {
  const item = error as { message?: string; stderr?: string };
  return [item.message, item.stderr].filter(Boolean).join('\n').trim() || '镜像转换失败。';
}

export async function convertImage(jobId: string, token: string, image: string, runtime = DEFAULT_RUNTIME) {
  if (!SUPPORTED_RUNTIMES.includes(runtime as (typeof SUPPORTED_RUNTIMES)[number])) throw new Error('不支持的 runtime。');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-convert-'));
  const loginDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const tokenPath = path.join(loginDir, 'token');
  const configPath = path.join(loginDir, 'config');
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  const logger = createJobLogger(jobId, '登录 Unikraft Cloud...\n');
  try {
    await fs.writeFile(tokenPath, token, { mode: 0o600 });
    await logger.flush();
    await runCommand(UNIKRAFT_CLI, ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000, onOutput: logger.append });
    await updateJob(jobId, { status: 'pulling' });
    logger.append(`\n拉取 Docker 镜像 ${image}，强制平台 linux/amd64...\n`);
    await runCommand('docker', ['pull', '--platform', 'linux/amd64', image], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, onOutput: logger.append });
    await updateJob(jobId, { status: 'inspecting' });
    logger.append('\n读取镜像配置...\n');
    const inspect = await runCommand('docker', ['image', 'inspect', image], { env, maxBuffer: 5 * 1024 * 1024, onOutput: logger.append });
    const inspectedImage = JSON.parse(inspect.stdout)[0] || {};
    const metadata = inspectedImage.Config || {};
    logger.append(`源镜像平台：${String(inspectedImage.Os || 'unknown')}/${String(inspectedImage.Architecture || 'unknown')}\n`);
    const command = [...(Array.isArray(metadata.Entrypoint) ? metadata.Entrypoint : []), ...(Array.isArray(metadata.Cmd) ? metadata.Cmd : [])].map(String);
    if (!command.length) throw new Error('Docker 镜像没有 Entrypoint 或 Cmd。');
    const workingDir = typeof metadata.WorkingDir === 'string' ? metadata.WorkingDir.trim() : '';
    const runtimeCommand = workingDir ? ['/bin/sh', '-c', `cd ${shellQuote(workingDir)} && exec ${command.map(shellQuote).join(' ')}`] : command;
    await fs.writeFile(path.join(dir, 'Dockerfile'), `FROM --platform=linux/amd64 ${image}\n`);
    await fs.writeFile(path.join(dir, 'Kraftfile'), ['spec: v0.7', '', `runtime: ${runtime}`, '', 'rootfs:', '  source:', '    path: ./Dockerfile', '    type: dockerfile', '  format: erofs', '', `cmd: ${JSON.stringify(runtimeCommand)}`].join('\n'));
    const namespace = process.env.UNIKRAFT_IMAGE_NAMESPACE || 'dghdnk';
    const imageName = image.split('/').pop()?.replace(/[^a-zA-Z0-9_.-]/g, '-') || 'app';
    const outputImage = `${namespace}/converted-${imageName}-${jobId.slice(0, 8)}:latest`;
    await updateJob(jobId, { status: 'building', outputImage });
    logger.append('\n开始构建并上传镜像...\n');
    logger.append(`构建 runtime=${runtime}; arch=Kraftfile/runtime 默认平台; cache=disabled\n`);
    const buildArgs = ['--config', configPath, 'build', dir, '--no-cache', '--output', outputImage];
    await runCommand(UNIKRAFT_CLI, buildArgs, { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, onOutput: logger.append });
    try {
      const inspect = await runCommand(UNIKRAFT_CLI, ['--config', configPath, 'image', 'get', outputImage, '--output', 'json'], { env, timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
      logger.append(`\n转换镜像平台摘要：\n${imageSummary(JSON.parse(inspect.stdout))}\n`);
    } catch (error) {
      logger.append(`\n无法读取转换镜像 manifest：${details(error)}\n`);
    }
    await logger.flush();
    await updateJob(jobId, { status: 'completed', outputImage });
  } catch (error) {
    await logger.flush();
    await updateJob(jobId, { status: 'failed', error: details(error) });
  } finally {
    await Promise.all([
      fs.rm(dir, { recursive: true, force: true }),
      fs.rm(loginDir, { recursive: true, force: true }),
    ]);
  }
}