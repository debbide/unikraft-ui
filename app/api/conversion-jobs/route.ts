import { NextResponse } from 'next/server';
import { getToken } from '@/app/actions/auth';
import { listJobs } from '@/lib/image-conversion/jobs';
import { recoverJobs } from '@/lib/image-conversion/worker';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getToken())) {
    return NextResponse.json(
      { jobs: [], error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await recoverJobs();
    return NextResponse.json(
      { jobs: await listJobs() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { jobs: [], error: '无法读取转换任务。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}