'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { listConversionJobs, retryConversionJob } from '@/app/actions/images';
import type { ConversionJob } from '@/lib/image-conversion/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const labels: Record<ConversionJob['status'], string> = {
  queued: '排队中', pulling: '拉取镜像', inspecting: '读取配置', building: '构建上传', completed: '已完成', failed: '失败',
};

export function ConversionJobs({ initialJobs }: { initialJobs: ConversionJob[] }) {
  const [jobs, setJobs] = useState(initialJobs.filter((job) => job.status !== 'failed'));
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const knownCompleted = useRef(new Set(initialJobs.filter((job) => job.status === 'completed').map((job) => job.id)));

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      const result = await listConversionJobs();
      if (disposed) return;
      const newlyCompleted = result.jobs.some((job) => job.status === 'completed' && !knownCompleted.current.has(job.id));
      result.jobs.filter((job) => job.status === 'completed').forEach((job) => knownCompleted.current.add(job.id));
      setJobs(result.jobs.filter((job) => job.status !== 'failed'));
      setError(result.error || '');
      if (newlyCompleted) router.refresh();
    }
    const timer = window.setInterval(refresh, 3000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [router]);

  function retry(id: string) {
    startTransition(async () => {
      const result = await retryConversionJob(id);
      if (result.error) setError(result.error);
      const refreshed = await listConversionJobs();
       setJobs(refreshed.jobs.filter((job) => job.status !== 'failed'));
    });
  }

  return <>
    {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
    <Table><TableHeader><TableRow><TableHead>源镜像</TableHead><TableHead>状态</TableHead><TableHead>输出镜像</TableHead><TableHead>更新时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
      {jobs.map((job) => <TableRow key={job.id}>
        <TableCell className="font-mono text-xs">{job.sourceImage}</TableCell>
        <TableCell><span className={job.status === 'failed' ? 'text-red-600' : job.status === 'completed' ? 'text-green-600' : ''}>{labels[job.status]}</span>{job.error && <p className="mt-1 max-w-md whitespace-pre-wrap text-xs text-red-600">{job.error}</p>}</TableCell>
        <TableCell className="font-mono text-xs">{job.outputImage || '-'}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{new Date(job.updatedAt).toLocaleString('zh-CN')}</TableCell>
        <TableCell className="text-right">{job.status === 'failed' && <Button size="sm" variant="outline" disabled={pending} onClick={() => retry(job.id)}><RefreshCw />重试</Button>}</TableCell>
      </TableRow>)}
      {!jobs.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无转换任务</TableCell></TableRow>}
    </TableBody></Table>
  </>;
}