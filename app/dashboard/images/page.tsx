import { listConversionJobs, listTemporaryImages } from '@/app/actions/images';
import { ConvertImageForm } from '@/components/convert-image-form';
import { ConversionJobs } from '@/components/conversion-jobs';
import { DeleteTemporaryImageButton } from '@/components/delete-temporary-image-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatImageSize(size: string) {
  if (!size || size === '-') return '-';
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return size;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export default async function ImagesPage() {
  const [{ images, error }, { jobs, error: jobsError }] = await Promise.all([listTemporaryImages(), listConversionJobs()]);
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">临时镜像</h1><p className="mt-2 text-muted-foreground">管理 Docker 转换生成的 Unikraft Cloud 镜像。</p></div>
    <ConvertImageForm />
    <Card><CardHeader><CardTitle>转换任务</CardTitle></CardHeader><CardContent><ConversionJobs initialJobs={jobs} />{jobsError && <p className="mt-3 text-sm text-red-600">{jobsError}</p>}</CardContent></Card>
    {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">读取失败: {error}</div>}
    <Card><CardHeader><CardTitle>临时镜像列表</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>镜像引用</TableHead><TableHead>大小</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
      {images.map((image) => <TableRow key={image.reference}><TableCell className="font-mono text-xs">{image.reference}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{formatImageSize(image.size)}</TableCell><TableCell className="text-right"><DeleteTemporaryImageButton reference={image.reference} metro="-" /></TableCell></TableRow>)}
      {!error && images.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">暂无临时镜像</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
  </div>;
}
