#!/usr/bin/env node

import { execFile } from 'node:child_process';

const image = process.argv[2];
if (!image) {
  console.error('用法：node scripts/resolve-amd64-image.mjs <image[:tag]|image@digest>');
  process.exit(2);
}

const run = (args) => new Promise((resolve, reject) => {
  execFile('docker', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error([error.message, stderr].filter(Boolean).join('\n')));
    else resolve(stdout);
  });
});

const validDigest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/i.test(value);
const matchesAmd64 = (platform) => platform?.os === 'linux' && platform?.architecture === 'amd64';

function findDigest(value) {
  const rows = Array.isArray(value) ? value : [value];
  for (const row of rows) {
    const descriptor = row?.Descriptor ?? row?.descriptor ?? row;
    if (matchesAmd64(descriptor?.platform) && validDigest(descriptor.digest)) return descriptor.digest;
    if (matchesAmd64(row?.platform) && validDigest(row.digest)) return row.digest;
  }
  return undefined;
}

const raw = await run(['manifest', 'inspect', '--verbose', image]);
let digest = findDigest(JSON.parse(raw));
if (!digest) {
  const index = JSON.parse(await run(['buildx', 'imagetools', 'inspect', image, '--raw']));
  digest = findDigest(index);
}
if (!digest) {
  console.error(`镜像 ${image} 没有可用的 linux/amd64 manifest。`);
  process.exit(1);
}

const reference = `${image.split('@', 1)[0]}@${digest}`;
console.log(`platform=linux/amd64`);
console.log(`digest=${digest}`);
console.log(`image=${reference}`);