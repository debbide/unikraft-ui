import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect as connectTls } from 'node:tls';
import next from 'next';
import { Client as SshClient } from 'ssh2';
import { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const metros = new Set(['dal', 'sfo', 'was', 'fra', 'sin']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fqdnPattern = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+\.unikraft\.app$/i;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((item) => {
    const separator = item.indexOf('=');
    if (separator < 1) return [];
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try {
      return [[key, decodeURIComponent(value)]];
    } catch {
      return [];
    }
  }));
}

function allowedOrigins(request) {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || (request.socket.encrypted ? 'https' : 'http');
  return host ? new Set([`${protocol}://${host}`, `http://${host}`, `https://${host}`]) : new Set();
}

function fingerprint(key) {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

function configuredFingerprints() {
  return new Set((process.env.UNIKRAFT_SSH_HOST_FINGERPRINTS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

async function resolveInstance(token, uuid, metro) {
  const response = await fetch(`https://api.${metro}.unikraft.cloud/v1/instances`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('无法验证实例访问权限。');
  const body = await response.json();
  const instances = body?.data?.instances;
  const instance = Array.isArray(instances) ? instances.find((item) => item?.uuid === uuid) : undefined;
  if (!instance) throw new Error('实例不存在或当前账号无权访问。');
  if (instance.state !== 'running') throw new Error('只有运行中的实例可以连接终端。');
  const fqdn = instance.service_group?.domains?.find((domain) => typeof domain?.fqdn === 'string')?.fqdn;
  if (!fqdn || !fqdnPattern.test(fqdn)) throw new Error('实例没有可用的 Unikraft SSH 域名。');
  return fqdn.toLowerCase();
}

async function openSession(socket, token, uuid, metro) {
  const keyPath = process.env.UNIKRAFT_SSH_PRIVATE_KEY_PATH || '/run/secrets/unikraft_ssh_key';
  const trusted = configuredFingerprints();
  if (!trusted.size) throw new Error('服务器未配置 UNIKRAFT_SSH_HOST_FINGERPRINTS。');
  const [privateKey, host] = await Promise.all([readFile(keyPath), resolveInstance(token, uuid, metro)]);

  const tlsSocket = connectTls({ host, port: 2222, servername: host, rejectUnauthorized: true });
  const ssh = new SshClient();
  let stream;
  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => socket.close(1000, 'idle timeout'), 30 * 60 * 1000);
  };
  const cleanup = () => {
    clearTimeout(idleTimer);
    stream?.end();
    ssh.end();
    tlsSocket.destroy();
  };
  socket.once('close', cleanup);
  socket.once('error', cleanup);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('SSH 连接超时。')), 15000);
    tlsSocket.once('error', reject);
    ssh.once('error', reject);
    ssh.once('ready', () => {
      clearTimeout(timeout);
      ssh.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (error, channel) => {
        if (error) return reject(error);
        stream = channel;
        channel.on('data', (data) => send(socket, { type: 'output', data: data.toString('utf8') }));
        channel.stderr.on('data', (data) => send(socket, { type: 'output', data: data.toString('utf8') }));
        channel.once('close', () => socket.close(1000, 'SSH session closed'));
        resetIdle();
        send(socket, { type: 'status', status: 'connected' });
        resolve();
      });
    });
    tlsSocket.once('secureConnect', () => ssh.connect({
      sock: tlsSocket,
      username: 'root',
      privateKey,
      readyTimeout: 15000,
      hostVerifier: (key) => trusted.has(fingerprint(key)),
    }));
  });

  socket.on('message', (raw) => {
    resetIdle();
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.close(1003, 'invalid message');
      return;
    }
    if (message.type === 'input' && typeof message.data === 'string' && message.data.length <= 65536) {
      stream?.write(message.data);
    } else if (message.type === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows)) {
      if (message.cols >= 2 && message.cols <= 500 && message.rows >= 1 && message.rows <= 200) {
        stream?.setWindow(message.rows, message.cols, 0, 0);
      }
    }
  });
}

await app.prepare();
const server = createServer((request, response) => handle(request, response));
const webSockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws/ssh') return socket.destroy();
  const origin = request.headers.origin;
  const token = parseCookies(request.headers.cookie).unikraft_pat;
  if (!origin || !allowedOrigins(request).has(origin) || !token) return socket.destroy();

  webSockets.handleUpgrade(request, socket, head, (webSocket) => {
    webSockets.emit('connection', webSocket, request, token);
  });
});

webSockets.on('connection', (socket, _request, token) => {
  send(socket, { type: 'status', status: 'authorizing' });
  const timeout = setTimeout(() => socket.close(1008, 'connect message required'), 10000);
  socket.once('message', (raw) => {
    clearTimeout(timeout);
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.close(1003, 'invalid message');
      return;
    }
    if (message.type !== 'connect' || !uuidPattern.test(message.uuid || '') || !metros.has(message.metro)) {
      socket.close(1008, 'invalid instance');
      return;
    }
    openSession(socket, token, message.uuid, message.metro).catch((error) => {
      send(socket, { type: 'error', message: error instanceof Error ? error.message : 'SSH 连接失败。' });
      socket.close(1011, 'SSH connection failed');
    });
  });
});

server.listen(port, hostname, () => console.log(`> Ready on http://${hostname}:${port}`));
