import { listTemporaryImages } from '@/app/actions/images';
import { DeleteTemporaryImageButton } from '@/components/delete-temporary-image-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function ImagesPage() {
  const { images, error } = await listTemporaryImages();
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">临时镜像</h1><p className="mt-2 text-muted-foreground">管理 Docker 转换生成的 Unikraft Cloud 镜像。</p></div>
    {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">读取失败: {error}</div>}
    <Card><CardHeader><CardTitle>临时镜像列表</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>镜像引用</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
      {images.map((image) => <TableRow key={image.reference}><TableCell className="font-mono text-xs">{image.reference}</TableCell><TableCell className="text-right"><DeleteTemporaryImageButton reference={image.reference} metro="-" /></TableCell></TableRow>)}
      {!error && images.length === 0 && <TableRow><TableCell colSpan={2} className="py-8 text-center text-muted-foreground">暂无临时镜像</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
  </div>;
}
