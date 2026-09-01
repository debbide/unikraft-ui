import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createJobLogger, updateJob } from './jobs';
import { EXAMPLES_COMMIT, EXAMPLES_REPOSITORY, getExampleTemplate } from '@/lib/examples/catalog';
import { runCommand } from './command';

const cli = process.env.UNIKRAFT_CLI || 'unikraft';
const details = (error: unknown) => String((error as { message?: string }).message || '官方示例构建失败。');

export async function buildExample(jobId: string, token: string, templateId: string) {
  const template = getExampleTemplate(templateId);
  if (!template) { await updateJob(jobId, { status: 'failed', error: '无效的官方模板。' }); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-example-'));
  const login = await fs.mkdtemp(path.join(os.tmpdir(), 'unikraft-login-'));
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  const tokenPath = path.join(login, 'token'); const configPath = path.join(login, 'config');
  const logger = createJobLogger(jobId, '登录 Unikraft Cloud...\n');
  try {
    await fs.writeFile(tokenPath, token, { mode: 0o600 });
    await logger.flush();
    const loginResult = await runCommand(cli, ['--config', configPath, 'login', '--no-browser', '--token', tokenPath], { env, timeout: 120000, onOutput: logger.append });
    const cleanOutput = (loginResult.stderr + loginResult.stdout).replace(/\x1b\[[0-9;]*m/g, '');
    const match = cleanOutput.match(/profile=([a-zA-Z0-9_-]+)/i) || cleanOutput.match(/organization=([a-zA-Z0-9_-]+)/i);
    const extractedNamespace = match ? match[1] : '';
    logger.append(`\n[调试探针] 干净的登录日志：${cleanOutput.trim().replace(/\s+/g, ' ')}\n`);
    logger.append(`[调试探针] 动态提取的用户名：${extractedNamespace || '提取失败！'}\n`);
    const namespace = process.env.UNIKRAFT_IMAGE_NAMESPACE || extractedNamespace || 'dghdnk';
    const output = `${namespace}/converted-example-${template.id}-${EXAMPLES_COMMIT.slice(0, 8)}:latest`;
    await updateJob(jobId, { status: 'pulling', outputImage: output });
    logger.append('\n下载官方示例源码...\n');
    await runCommand('git', ['clone', '--depth', '1', '--no-checkout', EXAMPLES_REPOSITORY, root], { env, timeout: 120000, maxBuffer: 5 * 1024 * 1024, onOutput: logger.append });
    await runCommand('git', ['-C', root, 'fetch', '--depth', '1', 'origin', EXAMPLES_COMMIT], { env, timeout: 120000, maxBuffer: 5 * 1024 * 1024, onOutput: logger.append });
    await runCommand('git', ['-C', root, 'checkout', '--detach', EXAMPLES_COMMIT], { env, timeout: 120000, onOutput: logger.append });
    const directory = path.join(root, template.directory);
    await fs.access(path.join(directory, 'Kraftfile'));
    await updateJob(jobId, { status: 'building', outputImage: output });
    logger.append('\n开始构建并上传镜像...\n');
    logger.append('构建 arch=Kraftfile/runtime 默认平台\n');
    const buildArgs = ['--config', configPath, 'build', directory, '--output', output];
    await runCommand(cli, buildArgs, { env, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, onOutput: logger.append });
    await logger.flush();
    await updateJob(jobId, { status: 'completed', outputImage: output });
  } catch (error) { await logger.flush(); await updateJob(jobId, { status: 'failed', error: details(error) }); }
  finally { await Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(login, { recursive: true, force: true })]); }
}