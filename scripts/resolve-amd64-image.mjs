#!/usr/bin/env node

import https from 'node:https';

const image = process.argv[2];
if (!image) {
  console.error('用法：node scripts/resolve-amd64-image.mjs <image[:tag]>');
  process.exit(2);
}

const validDigest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/i.test(value);
const reference = image.split('@', 1)[0];
const slash = reference.indexOf('/');
const first = slash === -1 ? '' : reference.slice(0, slash);
const host = first.includes('.') || first.includes(':') || first === 'localhost' ? first : 'registry-1.docker.io';
const repositoryWithTag = slash === -1 ? `library/${reference}` : reference.slice(slash + 1);
const separator = repositoryWithTag.lastIndexOf(':');
const hasTag = separator > repositoryWithTag.lastIndexOf('/');
const repository = hasTag ? repositoryWithTag.slice(0, separator) : repositoryWithTag;
const tag = hasTag ? repositoryWithTag.slice(separator + 1) : 'latest';
const endpoint = `https://${host}/v2/${repository.split('/').map(encodeURIComponent).join('/')}/manifests/${encodeURIComponent(tag)}`;
const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json';

const request = (url, headers = {}) => new Promise((resolve, reject) => {
  https.get(url, { headers }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => resolve({ response, body }));
  }).on('error', reject);
});

const manifestDigest = (body) => body?.manifests?.find((item) =>
  item.platform?.os === 'linux' && item.platform?.architecture === 'amd64' && validDigest(item.digest))?.digest;

let result = await request(endpoint, { Accept: accept });
if (result.response.statusCode === 401) {
  const challenge = String(result.response.headers['www-authenticate'] || '');
  const realm = challenge.match(/realm="([^"]+)"/)?.[1];
  if (realm) {
    const separator = realm.includes('?') ? '&' : '?';
    const tokenUrl = `${realm}${separator}service=${encodeURIComponent(host)}&scope=${encodeURIComponent(`repository:${repository}:pull`)}`;
    const tokenResult = await request(tokenUrl);
    const token = JSON.parse(tokenResult.body).token;
    result = await request(endpoint, { Accept: accept, Authorization: `Bearer ${token}` });
  }
}
if (result.response.statusCode !== 200) throw new Error(`Registry manifest 查询失败 HTTP ${result.response.statusCode}：${result.body}`);
const digest = manifestDigest(JSON.parse(result.body));
if (!digest) throw new Error(`镜像 ${image} 没有 linux/amd64 子 manifest`);

const imageRepository = separator > repositoryWithTag.lastIndexOf('/')
  ? `${first || 'docker.io'}/${repository}`
  : reference;

console.log('platform=linux/amd64');
console.log(`digest=${digest}`);
console.log(`image=${imageRepository}@${digest}`);