import { getToken } from '@/app/actions/auth';
import { fetchUnikraft, METROS } from '@/lib/unikraft/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function VolumesPage() {
  const token = await getToken();
  
  if (!token) {
    return <div>Unauthorized</div>;
  }

  let volumes: any[] = [];
  try {
    const results = await Promise.allSettled(
      METROS.map(metro => fetchUnikraft<any>('/v1/volumes', token, {}, metro).then(res => ({ metro, volumes: res?.data?.volumes || [] })))
    );
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const mapped = result.value.volumes.map((vol: any) => ({ ...vol, metro: result.value.metro }));
        volumes.push(...mapped);
      }
    });
  } catch (err: any) {
    return <div className="text-red-500 p-8">获取存储卷失败: {err.message}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">存储管理 (Volumes)</h1>
        <p className="text-muted-foreground mt-2">管理您在 Unikraft Cloud (SIN 区) 上的持久化存储卷。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>硬盘列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称 (Name)</TableHead>
                <TableHead>可用区 (Metro)</TableHead>
                <TableHead>状态 (State)</TableHead>
                <TableHead>容量 (Size)</TableHead>
                <TableHead>挂载对象 (Attached To)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volumes.map((vol: any) => (
                <TableRow key={vol.uuid}>
                  <TableCell className="font-medium">{vol.name}</TableCell>
                  <TableCell className="uppercase">{vol.metro}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${vol.state === 'attached' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                      {vol.state}
                    </span>
                  </TableCell>
                  <TableCell>{vol.size_mb} MB</TableCell>
                  <TableCell>
                    {vol.attached_to ? vol.attached_to.name : <span className="text-muted-foreground">未挂载 (可用)</span>}
                  </TableCell>
                </TableRow>
              ))}
              {volumes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
