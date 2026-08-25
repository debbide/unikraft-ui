'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteInstance } from '@/app/actions/instances';

export function DeleteInstanceButton({ uuid, metro, name }: { uuid: string, metro: string, name: string }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (window.confirm(`确定要删除实例 ${name} 吗？此操作不可恢复。`)) {
      startTransition(async () => {
        const res = await deleteInstance(uuid, metro);
        if (res?.error) {
          alert('删除失败: ' + res.error);
        }
      });
    }
  };

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}
