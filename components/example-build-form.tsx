'use client';
import { useActionState, useState } from 'react';
import { buildOfficialExample } from '@/app/actions/examples';
import { EXAMPLE_TEMPLATES } from '@/lib/examples/catalog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export function ExampleBuildForm() {
  const [state, action, pending] = useActionState(buildOfficialExample, null as { error?: string; success?: boolean } | null);
  const [selectedId, setSelectedId] = useState(EXAMPLE_TEMPLATES[0]?.id ?? '');
  const selected = EXAMPLE_TEMPLATES.find((item) => item.id === selectedId) ?? EXAMPLE_TEMPLATES[0];
  return <form action={action} className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
    <Select name="template" required value={selectedId} onValueChange={(value) => { if (value) setSelectedId(value); }}><SelectTrigger className="w-[min(100%,420px)]"><SelectValue placeholder="选择官方模板" /></SelectTrigger><SelectContent>{EXAMPLE_TEMPLATES.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.category}</SelectItem>)}</SelectContent></Select>
    <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}构建并上传镜像</Button>
    </div>
    {selected && <div className="rounded border bg-muted/30 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{selected.name}</h3><span className="text-muted-foreground">{selected.category}</span></div>
      <p className="mt-2 text-muted-foreground">{selected.description}</p>
      <dl className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-3"><div><dt className="font-medium text-foreground">官方目录</dt><dd className="break-all">{selected.directory}</dd></div><div><dt className="font-medium text-foreground">官方部署端口</dt><dd>{selected.port ?? '未声明'}</dd></div><div><dt className="font-medium text-foreground">官方内存建议</dt><dd>{selected.memoryMb ? `${selected.memoryMb} MB` : '未声明'}</dd></div></dl>
      <a className="mt-3 inline-block text-primary underline underline-offset-4" href={selected.sourceUrl} target="_blank" rel="noreferrer">查看官方源码</a>
    </div>}
    {state?.error && <p className="basis-full text-sm text-red-600">{state.error}</p>}
    {state?.success && <p className="basis-full text-sm text-green-600">已加入构建队列。</p>}
  </form>;
}