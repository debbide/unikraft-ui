'use server';

import { revalidatePath } from 'next/cache';
import { createJob, findActiveJob } from '@/lib/image-conversion/jobs';
import { enqueueExample, recoverJobs } from '@/lib/image-conversion/worker';
import { EXAMPLE_TEMPLATES, getExampleTemplate } from '@/lib/examples/catalog';
import { getToken } from './auth';

export async function listExamples() { return EXAMPLE_TEMPLATES; }
export async function buildOfficialExample(_previous: unknown, formData: FormData) {
  const token = await getToken(); if (!token) return { error: 'Unauthorized' };
  const id = String(formData.get('template') || ''); const template = getExampleTemplate(id);
  if (!template) return { error: '请选择有效的官方模板。' };
  await recoverJobs();
  const key = `example:${id}`; if (await findActiveJob(key)) return { error: '该模板已有构建任务在队列中。' };
  const job = await createJob(key); enqueueExample(job.id, token, id); revalidatePath('/dashboard/examples');
  return { success: true, job };
}