'use client';

import { useActionState } from 'react';
import { Loader2, WandSparkles } from 'lucide-react';
import { convertDockerImage } from '@/app/actions/images';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ConvertImageForm() {
  const [state, action, pending] = useActionState(convertDockerImage, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-md border p-4">
      <Input name="image" placeholder="Docker 镜像，例如 ghcr.io/org/app:latest" className="min-w-80 flex-1" required />
      <Label htmlFor="runtime" className="sr-only">Runtime</Label>
      <Select name="runtime" defaultValue="base-compat:latest">
        <SelectTrigger id="runtime" className="w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="base-compat:latest">普通版 runtime</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <WandSparkles />}
        {pending ? '正在提交' : '转换并上传'}
      </Button>
      <p aria-live="polite" className="w-full whitespace-pre-wrap text-sm">
        {state?.error && <span className="text-red-600">{state.error}</span>}
        {state?.success && <span className="text-green-600">转换任务已加入队列，可在下方查看进度。</span>}
      </p>
    </form>
  );
}
