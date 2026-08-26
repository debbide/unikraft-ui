'use client';

import { useActionState } from 'react';
import { Loader2, WandSparkles } from 'lucide-react';
import { convertDockerImage } from '@/app/actions/images';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ConvertImageForm() {
  const [state, action, pending] = useActionState(convertDockerImage, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-md border p-4">
      <Input name="image" placeholder="Docker 镜像，例如 ghcr.io/org/app:latest" className="min-w-80 flex-1" required />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <WandSparkles />}
        {pending ? '转换任务已提交' : '转换并上传'}
      </Button>
      <p aria-live="polite" className="w-full whitespace-pre-wrap text-sm">
        {state?.error && <span className="text-red-600">{state.error}</span>}
        {state?.success && <span className="text-green-600">转换已在后台开始，完成后刷新列表。</span>}
      </p>
    </form>
  );
}
