import { getToken } from '@/app/actions/auth';
import { fetchUnikraft, METROS } from '@/lib/unikraft/client';
import { CreateVolumeForm } from '@/components/create-volume-form';
import { DeleteVolumeButton } from '@/components/delete-volume-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VolumeRow extends Record<string, unknown> {
  metro: string;
  uuid?: string;
  name?: string;
  state?: string;
  size_mb?: number;
  attached_to?: { name?: string };
}

export default async function VolumesPage() {
  const token = await getToken();
  if (!token) return <div>Unauthorized</div>;

  const results = await Promise.allSettled(
    METROS.map(async (metro) => {
      const result = await fetchUnikraft<{
        data?: { volumes?: unknown[] };
        volumes?: unknown[];
      }>('/v1/volumes', token, {}, metro);

      return (result.data?.volumes || result.volumes || []).map(
        (volume) => ({ ...(volume as Record<string, unknown>), metro }) as VolumeRow,
      );
    }),
  );
  const volumes = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">存储管理 (Volumes)</h1>
        <p className="mt-2 text-muted-foreground">
          存储卷属于指定 Metro。请先在实例目标 Metro 创建，再在部署时按名称挂载。
        </p>
      </div>

      <CreateVolumeForm />

      <Card>
        <CardHeader>
          <CardTitle>存储卷列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>Metro</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>容量</TableHead>
                <TableHead>挂载对象</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volumes.map((volume) => {
                const name = String(volume.name || '');
                const uuid = String(volume.uuid || volume.id || '');
                const metro = volume.metro;
                const state = String(volume.state || '');

                return (
                  <TableRow key={`${metro}:${name}`}>
                    <TableCell>{name}</TableCell>
                    <TableCell className="uppercase">{metro}</TableCell>
                    <TableCell>{state}</TableCell>
                    <TableCell>{volume.size_mb || '-'} MB</TableCell>
                    <TableCell>{volume.attached_to?.name || '-'}</TableCell>
                    <TableCell className="text-right">
                      <DeleteVolumeButton
                        volumeId={uuid || name}
                        name={name}
                        metro={metro}
                        disabled={state !== 'available'}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {volumes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无存储卷
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
