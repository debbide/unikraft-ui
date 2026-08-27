'use client';

import { useState, useTransition } from 'react';
import { Bug, Loader2 } from 'lucide-react';
import { diagnoseInstance } from '@/app/actions/instances';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Result = { details?: string; logs?: string; detailsError?: string; logsError?: string; error?: string };

export function InstanceDiagnostics({ uuid, metro, name }: { uuid: string; metro: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const load = () => startTransition(async () => setResult(await diagnoseInstance(uuid, metro, name)));

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) load(); }}>
    <DialogTrigger render={<Button size="sm" variant="outline" />}><Bug />诊断</DialogTrigger>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>实例诊断：{name}</DialogTitle>
        <DialogDescription>{metro.toUpperCase()} · 实例详情与启动 Console</DialogDescription>
      </DialogHeader>
      {pending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" />正在读取…</div>}
      {result?.error && <p className="whitespace-pre-wrap text-sm text-red-600">{result.error}</p>}
      {result && !result.error && <div className="grid gap-4 md:grid-cols-2">
        <section><h3 className="mb-2 text-sm font-semibold">实例详情 / stop.reason</h3>{result.detailsError && <p className="mb-2 whitespace-pre-wrap text-xs text-red-600">{result.detailsError}</p>}<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{result.details || '无输出'}</pre></section>
        <section><h3 className="mb-2 text-sm font-semibold">Console logs</h3>{result.logsError && <p className="mb-2 whitespace-pre-wrap text-xs text-red-600">{result.logsError}</p>}<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{result.logs || '无输出'}</pre></section>
      </div>}
      <DialogFooter><Button type="button" variant="outline" onClick={load} disabled={pending}>重新读取</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}