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
    const nestedDigest = findDigest(row?.manifests);
    if (nestedDigest) return nestedDigest;
  }
  return undefined;
}

async function pullAndResolve(image) {
  await run(['pull', '--platform', 'linux/amd64', image]);
  let inspected;
  try {
    inspected = JSON.parse(await run(['image', 'inspect', '--platform', 'linux/amd64', image]))[0];
  } catch {
    inspected = JSON.parse(await run(['image', 'inspect', image]))[0];
  }
  const repository = image.split('@', 1)[0].split(':', 1)[0];
  const digest = inspected?.RepoDigests?.find((item) => typeof item === 'string' && item.startsWith(`${repository}@sha256:`))?.split('@')[1];
  return validDigest(digest) ? digest : undefined;
}

const inspectors = [
  ['docker manifest inspect --verbose', ['manifest', 'inspect', '--verbose', image]],
  ['docker manifest inspect', ['manifest', 'inspect', image]],
  ['docker buildx imagetools inspect --raw', ['buildx', 'imagetools', 'inspect', image, '--raw']],
];

let digest;
for (const [label, args] of inspectors) {
  if (digest) break;
  try {
    digest = findDigest(JSON.parse(await run(args)));
  } catch (error) {
    console.error(`${label} 查询失败：${error.message}`);
  }
}
if (!digest) digest = await pullAndResolve(image);
if (!digest) {
  console.log('platform=linux/amd64');
  console.log('digest=unavailable');
  console.log(`image=${image}`);
  process.exit(0);
}

const reference = `${image.split('@', 1)[0]}@${digest}`;
console.log(`platform=linux/amd64`);
console.log(`digest=${digest}`);
console.log(`image=${reference}`);