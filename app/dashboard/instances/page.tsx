import { getToken } from '@/app/actions/auth';
import { fetchUnikraft, METROS } from '@/lib/unikraft/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeployModal } from '@/components/deploy-modal';
import { DeleteInstanceButton } from '@/components/delete-instance-button';
import { listTemporaryImages } from '@/app/actions/images';

export default async function InstancesPage() {
  const token = await getToken();
  
  if (!token) {
    return <div>Unauthorized</div>;
  }

  // 获取所有区的实例列表
  let instances: any[] = [];
  const volumesByMetro: Record<string, { name: string; state?: string }[]> = {};
  const { images } = await listTemporaryImages();
  try {
    const results = await Promise.allSettled(
      METROS.map(metro => fetchUnikraft<any>('/v1/instances', token, {}, metro).then(res => ({ metro, instances: res?.data?.instances || [] })))
    );
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const mapped = result.value.instances.map((inst: any) => ({ ...inst, metro: result.value.metro }));
        instances.push(...mapped);
      }
    });
    await Promise.all(METROS.map(async (metro) => {
      try {
        const result = await fetchUnikraft<any>('/v1/volumes', token, {}, metro);
        const volumes = result?.data?.volumes || result?.volumes || [];
        volumesByMetro[metro] = volumes
          .filter((volume: any) => volume?.name && volume?.state === 'available')
          .map((volume: any) => ({ name: String(volume.name), state: volume.state }));
      } catch {
        volumesByMetro[metro] = [];
      }
    }));
  } catch (err: any) {
    return <div className="text-red-500 p-8">获取实例列表失败: {err.message}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">实例管理 (Instances)</h1>
          <p className="text-muted-foreground mt-2">在这里查看和管理您运行在 Unikraft Cloud 上的所有微内核实例。</p>
        </div>
        <DeployModal volumesByMetro={volumesByMetro} images={images.map((image) => image.reference)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>实例列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称 (Name)</TableHead>
                <TableHead>可用区 (Metro)</TableHead>
                <TableHead>状态 (State)</TableHead>
                <TableHead>镜像 (Image)</TableHead>
                <TableHead>内存 (Memory)</TableHead>
                <TableHead>域名 (FQDN)</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((instance: any) => (
                <TableRow key={instance.uuid}>
                  <TableCell className="font-medium">{instance.name}</TableCell>
                  <TableCell className="uppercase">{instance.metro}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${instance.state === 'running' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {instance.state}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={instance.image}>{instance.image}</TableCell>
                  <TableCell>{instance.memory_mb} MB</TableCell>
                  <TableCell>
                    {instance.service_group?.domains?.[0]?.fqdn ? (
                      <a href={`https://${instance.service_group.domains[0].fqdn}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                        {instance.service_group.domains[0].fqdn}
                      </a>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteInstanceButton uuid={instance.uuid} metro={instance.metro} name={instance.name} />
                  </TableCell>
                </TableRow>
              ))}
              {instances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    暂无实例
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
