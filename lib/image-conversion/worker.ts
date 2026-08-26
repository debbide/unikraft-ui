import { convertImage } from './converter';
import { listJobs, updateJob } from './jobs';
let running = false;
let recovered = false;

export function enqueueConversion(jobId: string, token: string, image: string) {
  if (running) return;
  running = true;
  void (async () => {
    try { await convertImage(jobId, token, image); }
    finally { running = false; void processNext(token); }
  })();
}

async function processNext(token: string) {
  const jobs = await listJobs();
  const next = jobs.find((job) => job.status === 'queued');
  if (next) enqueueConversion(next.id, token, next.sourceImage);
}

export async function recoverJobs() {
  if (recovered) return;
  recovered = true;
  const jobs = await listJobs();
  await Promise.all(jobs.filter((job) => ['pulling', 'inspecting', 'building'].includes(job.status)).map((job) => updateJob(job.id, { status: 'failed', error: '服务重启导致任务中断，请重试。' })));
}