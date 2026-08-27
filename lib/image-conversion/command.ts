import { spawn } from 'child_process';

type CommandOptions = {
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
  onOutput?: (chunk: string) => void;
};

function quoteArgument(value: string) {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : JSON.stringify(value);
}

export function runCommand(command: string, args: string[], options: CommandOptions = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const displayCommand = [command, ...args].map(quoteArgument).join(' ');
    options.onOutput?.(`\n$ ${displayCommand}\n`);
    const child = spawn(command, args, { env: options.env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let exceededBuffer = false;
    const append = (target: 'stdout' | 'stderr', value: Buffer | string) => {
      const chunk = value.toString();
      if (target === 'stdout') stdout += chunk;
      else stderr += chunk;
      options.onOutput?.(`[${target}] ${chunk}`);
      if (options.maxBuffer && stdout.length + stderr.length > options.maxBuffer) {
        exceededBuffer = true;
        child.kill();
      }
    };
    const timer = options.timeout ? setTimeout(() => { timedOut = true; child.kill(); }, options.timeout) : undefined;
    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.once('error', (error) => {
      options.onOutput?.(`[spawn-error] ${error.name}: ${error.message}\n`);
      if (!settled) { settled = true; reject(error); }
    });
    child.once('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      options.onOutput?.(`[exit] code=${code ?? 'unknown'} signal=${signal || 'none'} timedOut=${timedOut} exceededBuffer=${exceededBuffer}\n`);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const reason = timedOut
          ? `命令执行超时（${Math.round((options.timeout || 0) / 60000)} 分钟）。`
          : exceededBuffer
            ? '命令输出超过限制。'
            : `命令退出码 ${code ?? '未知'}${signal ? `（${signal}）` : ''}。`;
        const error = new Error([reason, stdout, stderr].filter(Boolean).join('\n')) as Error & { stdout: string; stderr: string };
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}