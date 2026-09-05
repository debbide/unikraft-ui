'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, RotateCw, Square } from 'lucide-react';
import {
  changeInstanceState,
  type InstanceLifecycleAction,
} from '@/app/actions/instances';
import { Button } from '@/components/ui/button';

type Props = {
  uuid: string;
  metro: string;
  name: string;
  state: string;
};

const transitionalStates = new Set(['starting', 'draining', 'stopping']);

export function InstanceLifecycleControls({ uuid, metro, name, state }: Props) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<InstanceLifecycleAction | null>(null);
  const router = useRouter();
  const isTransitioning = transitionalStates.has(state);

  useEffect(() => {
    if (!isTransitioning) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, 1500);

    return () => window.clearInterval(timer);
  }, [isTransitioning, router]);

  function run(action: InstanceLifecycleAction) {
    const label = action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启';
    if (action !== 'start' && !window.confirm(`确定要${label}实例 ${name} 吗？`)) return;

    setPendingAction(action);
    startTransition(async () => {
      try {
        const result = await changeInstanceState(uuid, metro, action);
        if (result.error) {
          window.alert(`${label}失败: ${result.error}`);
          return;
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  if (isPending && pendingAction) {
    const label = pendingAction === 'start' ? '启动中' : pendingAction === 'stop' ? '停止中' : '重启中';
    return (
      <Button size="sm" variant="outline" disabled aria-label={label}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </Button>
    );
  }

  if (isTransitioning) {
    const label = state === 'starting' ? '启动中' : state === 'draining' ? '停止中' : '停止中';
    return (
      <Button size="sm" variant="outline" disabled aria-label={label}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </Button>
    );
  }

  if (state === 'stopped' || state === 'standby') {
    return (
      <Button size="sm" variant="outline" onClick={() => run('start')} title="启动实例">
        <Play className="h-4 w-4" />
        启动
      </Button>
    );
  }

  if (state !== 'running') return null;

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => run('stop')} title="停止实例">
        <Square className="h-4 w-4" />
        停止
      </Button>
      <Button size="sm" variant="outline" onClick={() => run('restart')} title="重启实例">
        <RotateCw className="h-4 w-4" />
      </Button>
    </div>
  );
}
