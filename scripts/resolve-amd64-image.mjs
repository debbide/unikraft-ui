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

async function pullAndResolve(image) {
  await run(['pull', '--platform', 'linux/amd64', image]);
  const inspected = JSON.parse(await run(['image', 'inspect', image]))[0];
  if (inspected?.Os !== 'linux' || inspected?.Architecture !== 'amd64') {
    throw new Error(`拉取后的源镜像平台不是 linux/amd64，而是 ${inspected?.Os || 'unknown'}/${inspected?.Architecture || 'unknown'}。`);
  }
  const repository = image.split('@', 1)[0].split(':', 1)[0];
  return inspected.RepoDigests?.find((item) => item.startsWith(`${repository}@sha256:`))?.split('@')[1];
}

let digest;
try {
  digest = findDigest(JSON.parse(await run(['manifest', 'inspect', '--verbose', image])));
} catch {
  // Older Docker CLIs may not support --verbose. The plain manifest command is
  // available without Docker Buildx and still exposes platform descriptors.
}
if (!digest) {
  try {
    digest = findDigest(JSON.parse(await run(['manifest', 'inspect', image])));
  } catch {
    // Some registries reject Docker's manifest endpoint even though a normal
    // platform pull still works.
  }
}
if (!digest) digest = await pullAndResolve(image);
if (!digest) {
  console.error(`镜像 ${image} 没有可用的 linux/amd64 manifest。`);
  process.exit(1);
}

const reference = `${image.split('@', 1)[0]}@${digest}`;
console.log(`platform=linux/amd64`);
console.log(`digest=${digest}`);
console.log(`image=${reference}`);