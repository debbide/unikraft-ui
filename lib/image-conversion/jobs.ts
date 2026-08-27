import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { ConversionJob, ConversionStatus } from './types';

const storeDir = process.env.UNIKRAFT_DATA_DIR || path.join(os.tmpdir(), 'unikraft-ui');
const storePath = path.join(storeDir, 'image-conversion-jobs.json');
let operation = Promise.resolve();

async function readJobs(): Promise<ConversionJob[]> {
  try {
    return JSON.parse(await fs.readFile(storePath, 'utf8')) as ConversionJob[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeJobs(jobs: ConversionJob[]) {
  await fs.mkdir(storeDir, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(jobs, null, 2), 'utf8');
  await fs.rename(temporaryPath, storePath);
}

function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = operation.then(action);
  operation = result.then(() => undefined, () => undefined);
  return result;
}

export function listJobs() { return serialized(readJobs); }

export function findActiveJob(sourceImage: string) {
  return serialized(async () => (await readJobs()).find((job) => job.sourceImage === sourceImage && ['queued', 'pulling', 'inspecting', 'building'].includes(job.status)));
}

export function createJob(sourceImage: string) {
  return serialized(async () => {
    const jobs = await readJobs();
    const now = new Date().toISOString();
    const job: ConversionJob = { id: randomUUID(), sourceImage, status: 'queued', createdAt: now, updatedAt: now };
    await writeJobs([job, ...jobs].slice(0, 100));
    return job;
  });
}

export function updateJob(id: string, patch: Partial<Pick<ConversionJob, 'outputImage' | 'error' | 'log'>> & { status?: ConversionStatus }) {
  return serialized(async () => {
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === id);
    if (!job) return undefined;
    if (patch.log !== undefined) patch.log = patch.log.slice(-20000);
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    await writeJobs(jobs);
    return job;
  });
}

export function createJobLogger(id: string, initial = '') {
  let log = initial;
  let timer: NodeJS.Timeout | undefined;
  let pending = Promise.resolve();
  const persist = () => {
    timer = undefined;
    const snapshot = log;
    pending = pending.then(() => updateJob(id, { log: snapshot })).then(() => undefined);
    return pending;
  };
  return {
    append(chunk: string) {
      log = `${log}${chunk}`.slice(-20000);
      if (!timer) timer = setTimeout(() => { void persist(); }, 500);
    },
    async flush() {
      if (timer) { clearTimeout(timer); timer = undefined; }
      await persist();
    },
  };
}