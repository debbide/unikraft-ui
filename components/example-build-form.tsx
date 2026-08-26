'use client';
import { useActionState } from 'react';
import { buildOfficialExample } from '@/app/actions/examples';
import { EXAMPLE_TEMPLATES } from '@/lib/examples/catalog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export function ExampleBuildForm() {
  const [state, action, pending] = useActionState(buildOfficialExample, null as { error?: string; success?: boolean } | null);
  return <form action={action} className="flex flex-wrap items-center gap-3">
    <Select name="template" required><SelectTrigger className="w-[280px]"><SelectValue placeholder="选择官方模板" /></SelectTrigger><SelectContent>{EXAMPLE_TEMPLATES.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.memoryMb}MB</SelectItem>)}</SelectContent></Select>
    <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}构建并上传镜像</Button>
    {state?.error && <p className="basis-full text-sm text-red-600">{state.error}</p>}
    {state?.success && <p className="basis-full text-sm text-green-600">已加入构建队列。</p>}
  </form>;
}