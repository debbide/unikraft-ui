'use client';

import { useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteVolume } from '@/app/actions/volumes';

export function DeleteVolumeButton({ volumeId, name, metro, disabled }: { volumeId: string; name: string; metro: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return <Button type="button" variant="destructive" size="icon-sm" title="删除卷" disabled={disabled || pending} onClick={() => {
    if (!window.confirm(`确定删除卷 ${name}？`)) return;
    startTransition(async () => {
      const result = await deleteVolume(volumeId, metro);
      if (result.error) window.alert(`删除失败: ${result.error}`);
      else window.location.reload();
    });
  }}>{pending ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>;
}
