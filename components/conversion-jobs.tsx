'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { retryConversionJob } from '@/app/actions/images';
import type { ConversionJob } from '@/lib/image-conversion/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const labels: Record<ConversionJob['status'], string> = {
  queued: '排队中', pulling: '拉取镜像', inspecting: '读取配置', building: '构建上传', completed: '已完成', failed: '失败',
};

type JobsResponse = { jobs: ConversionJob[]; error?: string };

async function fetchConversionJobs(): Promise<JobsResponse> {
  const response = await fetch('/api/conversion-jobs', { cache: 'no-store' });
  const result = await response.json() as JobsResponse;
  if (!response.ok) throw new Error(result.error || '无法读取转换任务。');
  return result;
}

export function ConversionJobs({ initialJobs, sourcePrefix }: { initialJobs: ConversionJob[]; sourcePrefix?: string }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const knownCompleted = useRef(new Set(initialJobs.filter((job) => job.status === 'completed').map((job) => job.id)));

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const result = await fetchConversionJobs();
        if (disposed) return;
        const visibleJobs = sourcePrefix ? result.jobs.filter((job) => job.sourceImage.startsWith(sourcePrefix)) : result.jobs;
        const newlyCompleted = visibleJobs.some((job) => job.status === 'completed' && !knownCompleted.current.has(job.id));
        visibleJobs.filter((job) => job.status === 'completed').forEach((job) => knownCompleted.current.add(job.id));
        setJobs(visibleJobs);
        setError(result.error || '');
        if (newlyCompleted) router.refresh();
      } catch (refreshError) {
        if (!disposed) setError(refreshError instanceof Error ? refreshError.message : '无法读取转换任务。');
      }
    }
    const timer = window.setInterval(refresh, 3000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [router, sourcePrefix]);

  function retry(id: string) {
    startTransition(async () => {
      try {
        const result = await retryConversionJob(id);
        if (result.error) {
          setError(result.error);
          return;
        }
        const refreshed = await fetchConversionJobs();
        setJobs(sourcePrefix ? refreshed.jobs.filter((job) => job.sourceImage.startsWith(sourcePrefix)) : refreshed.jobs);
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : '无法重试转换任务。');
      }
    });
  }

  return <>
    {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
    <Table><TableHeader><TableRow><TableHead>源镜像</TableHead><TableHead>状态</TableHead><TableHead>输出镜像</TableHead><TableHead>更新时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
      {jobs.map((job) => <TableRow key={job.id}>
        <TableCell className="font-mono text-xs">{job.sourceImage}<p className="mt-1 font-sans text-[11px] text-muted-foreground">{job.runtime || 'base-compat:latest'}</p></TableCell>
        <TableCell><span className={job.status === 'failed' ? 'text-red-600' : job.status === 'completed' ? 'text-green-600' : ''}>{labels[job.status]}</span>{job.error && <p className="mt-1 max-w-md whitespace-pre-wrap text-xs text-red-600">{job.error}</p>}{job.log && <details className="mt-2 max-w-xl"><summary className="cursor-pointer text-xs text-muted-foreground">查看构建日志</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{job.log}</pre></details>}</TableCell>
        <TableCell className="font-mono text-xs">{job.outputImage || '-'}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{new Date(job.updatedAt).toLocaleString('zh-CN')}</TableCell>
        <TableCell className="text-right">{job.status === 'failed' && <Button size="sm" variant="outline" disabled={pending} onClick={() => retry(job.id)}><RefreshCw />重试</Button>}</TableCell>
      </TableRow>)}
      {!jobs.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无转换任务</TableCell></TableRow>}
    </TableBody></Table>
  </>;
}