import { getToken } from '@/app/actions/auth';
import { fetchUnikraft, METROS } from '@/lib/unikraft/client';
import { DeleteVolumeButton } from '@/components/delete-volume-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VolumeRow extends Record<string, unknown> {
  metro: string;
  name?: string;
  state?: string;
  size_mb?: number;
  size?: number | string;
  attached_to?: { name?: string };
}

export default async function VolumesPage() {
  const token = await getToken();
  if (!token) return <div>Unauthorized</div>;
  const results = await Promise.allSettled(METROS.map(async (metro) => {
    const result = await fetchUnikraft<{ data?: { volumes?: unknown[] }; volumes?: unknown[] }>('/v1/volumes', token, {}, metro);
    const volumes = result.data?.volumes || result.volumes || [];
    return volumes.map((volume) => ({ ...(volume as Record<string, unknown>), metro }));
  }));
  const volumes: VolumeRow[] = results.flatMap((result) => result.status === 'fulfilled' ? result.value as VolumeRow[] : []);

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">存储管理 (Volumes)</h1><p className="mt-2 text-muted-foreground">管理 Unikraft Cloud 持久化存储卷。</p></div>
    <Card><CardHeader><CardTitle>存储卷列表</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>Metro</TableHead><TableHead>状态</TableHead><TableHead>容量</TableHead><TableHead>挂载对象</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
      {volumes.map((volume) => { const name = String(volume.name || ''); const metro = String(volume.metro || ''); const state = String(volume.state || ''); const attached = volume.attached_to as { name?: string } | undefined; return <TableRow key={`${metro}:${name}`}><TableCell className="font-medium">{name}</TableCell><TableCell className="uppercase">{metro}</TableCell><TableCell>{state}</TableCell><TableCell>{String(volume.size_mb || volume.size || '-')} MB</TableCell><TableCell>{attached?.name || '-'}</TableCell><TableCell className="text-right"><DeleteVolumeButton name={name} metro={metro} disabled={state !== 'available'} /></TableCell></TableRow>; })}
      {volumes.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无存储卷</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
  </div>;
}
