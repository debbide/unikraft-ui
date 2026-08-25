'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteTemporaryImage } from '@/app/actions/images';
import { Button } from '@/components/ui/button';

export function DeleteTemporaryImageButton({ reference, metro }: { reference: string; metro: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <Button type="button" variant="destructive" size="icon-sm" disabled={pending} title="删除临时镜像" onClick={() => {
    if (!window.confirm(`确定删除临时镜像 ${reference}？`)) return;
    startTransition(async () => {
      const result = await deleteTemporaryImage(reference, metro);
      if (result.error) {
        window.alert(`删除失败: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }}>{pending ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>;
}
