import { ProxyAgent, setGlobalDispatcher } from 'undici';

// 如果环境变量里有 proxy 设置，则全局配置给 Node.js 的原生 fetch
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(dispatcher);
    console.log(`[Next.js] Using Proxy: ${proxyUrl}`);
  } catch(e) {
    console.error("Failed to set proxy", e);
  }
}

export const METROS = ['dal', 'sfo', 'was', 'fra', 'sin'];

export async function fetchUnikraft<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
  metro?: string
): Promise<T> {
  const baseUrl = metro ? `https://api.${metro}.unikraft.cloud` : 'https://api.sin.unikraft.cloud';
  const url = `${baseUrl}${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(10000),
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // Ignore JSON parse error if response is not JSON
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
