import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { updateJob } from './jobs';
import { EXAMPLES_COMMIT, EXAMPLES_REPOSITORY, getExampleTemplate } from '@/lib/examples/catalog';

const execFileAsync = promisify(execFile);
const cli = process.env.UNIKRAFT_CLI || 'unikraft';
const details = (error: unknown) => [String((error as { message?: string }).message || ''), String((error as { stderr?: string }).stderr || '')].filter(Boolean).join('\n') || '官方示例构建失败。';

export async function buildExample(jobId: string, token: string, templateId: string) {
  const template = getExampleTemplate(templateId);
  if (!template) { await updateJob(jobId, { status: 'failed', error: '无效的官方模板。' }); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-example-'));
  const login = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  const tokenPath = path.join(login, 'token'); const configPath = path.join(login, 'config');
  const namespace = process.env.UNIKRAFT_IMAGE_NAMESPACE || 'dghdnk';
  // Keep the existing temporary-image/deployment allow-list compatible.
  const output = `${namespace}/converted-example-${template.id}-${EXAMPLES_COMMIT.slice(0, 8)}:latest`;
  try {
    await fs.writeFile(tokenPath, token, { mode: 0o600 });
    await execFileAsync(cli, ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000 });
    await updateJob(jobId, { status: 'pulling', outputImage: output });
    await execFileAsync('git', ['clone', '--depth', '1', '--no-checkout', EXAMPLES_REPOSITORY, root], { env, timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
    await execFileAsync('git', ['-C', root, 'fetch', '--depth', '1', 'origin', EXAMPLES_COMMIT], { env, timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
    await execFileAsync('git', ['-C', root, 'checkout', '--detach', EXAMPLES_COMMIT], { env, timeout: 120000 });
    const directory = path.join(root, template.directory);
    await fs.access(path.join(directory, 'Kraftfile')); await fs.access(path.join(directory, 'Dockerfile'));
    await updateJob(jobId, { status: 'building', outputImage: output });
    await execFileAsync(cli, ['--config', configPath, 'build', directory, '--output', output], { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
    await updateJob(jobId, { status: 'completed', outputImage: output });
  } catch (error) { await updateJob(jobId, { status: 'failed', error: details(error) }); }
  finally { await Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(login, { recursive: true, force: true })]); }
}