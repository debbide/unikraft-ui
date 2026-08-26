import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { updateJob } from './jobs';

const execFileAsync = promisify(execFile);
const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || 'unikraft';

function shellQuote(value: string) { return `'${value.replace(/'/g, `'\\''`)}'`; }
function details(error: unknown) {
  const item = error as { message?: string; stderr?: string };
  return [item.message, item.stderr].filter(Boolean).join('\n').trim() || '镜像转换失败。';
}

export async function convertImage(jobId: string, token: string, image: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-convert-'));
  const loginDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const tokenPath = path.join(loginDir, 'token');
  const configPath = path.join(loginDir, 'config');
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  try {
    await fs.writeFile(tokenPath, token, { mode: 0o600 });
    await execFileAsync(UNIKRAFT_CLI, ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    await updateJob(jobId, { status: 'pulling' });
    await execFileAsync('docker', ['pull', image], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
    await updateJob(jobId, { status: 'inspecting' });
    const inspect = await execFileAsync('docker', ['image', 'inspect', image], { env, maxBuffer: 5 * 1024 * 1024 });
    const metadata = JSON.parse(inspect.stdout)[0]?.Config || {};
    const command = [...(Array.isArray(metadata.Entrypoint) ? metadata.Entrypoint : []), ...(Array.isArray(metadata.Cmd) ? metadata.Cmd : [])].map(String);
    if (!command.length) throw new Error('Docker 镜像没有 Entrypoint 或 Cmd。');
    const workingDir = typeof metadata.WorkingDir === 'string' ? metadata.WorkingDir.trim() : '';
    const runtimeCommand = workingDir ? ['/bin/sh', '-c', `cd ${shellQuote(workingDir)} && exec ${command.map(shellQuote).join(' ')}`] : command;
    await fs.writeFile(path.join(dir, 'Dockerfile'), `FROM ${image}\n`);
    await fs.writeFile(path.join(dir, 'Kraftfile'), ['spec: v0.7', '', 'runtime: base-compat:latest', '', 'rootfs:', '  source:', '    path: ./Dockerfile', '    type: dockerfile', '  format: erofs', '', `cmd: ${JSON.stringify(runtimeCommand)}`].join('\n'));
    const namespace = process.env.UNIKRAFT_IMAGE_NAMESPACE || 'dghdnk';
    const imageName = image.split('/').pop()?.replace(/[^a-zA-Z0-9_.-]/g, '-') || 'app';
    const outputImage = `${namespace}/converted-${imageName}-${jobId.slice(0, 8)}:latest`;
    await updateJob(jobId, { status: 'building', outputImage });
    await execFileAsync(UNIKRAFT_CLI, ['--config', configPath, 'build', dir, '--output', outputImage], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
    await updateJob(jobId, { status: 'completed', outputImage });
  } catch (error) {
    await updateJob(jobId, { status: 'failed', error: details(error) });
  } finally {
    await Promise.all([
      fs.rm(dir, { recursive: true, force: true }),
      fs.rm(loginDir, { recursive: true, force: true }),
    ]);
  }
}