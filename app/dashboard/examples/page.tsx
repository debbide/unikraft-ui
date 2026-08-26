import { ExampleBuildForm } from '@/components/example-build-form';
import { listConversionJobs } from '@/app/actions/images';
import { ConversionJobs } from '@/components/conversion-jobs';
import { EXAMPLE_TEMPLATES, EXAMPLES_COMMIT } from '@/lib/examples/catalog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ExamplesPage() {
  const { jobs } = await listConversionJobs();
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">官方模板</h1><p className="mt-2 text-muted-foreground">基于 Unikraft Cloud 官方 examples 的固定版本构建，版本：{EXAMPLES_COMMIT.slice(0, 8)}。</p></div>
    <Card><CardHeader><CardTitle>构建官方示例</CardTitle></CardHeader><CardContent><ExampleBuildForm /><div className="mt-5 grid gap-2 md:grid-cols-2">{EXAMPLE_TEMPLATES.map((item) => <div key={item.id} className="rounded border p-3 text-sm"><b>{item.name}</b><p className="text-muted-foreground">{item.description} 默认 {item.port} / {item.memoryMb}MB</p></div>)}</div></CardContent></Card>
    <Card><CardHeader><CardTitle>构建任务</CardTitle></CardHeader><CardContent><ConversionJobs initialJobs={jobs.filter((job) => job.sourceImage.startsWith('example:'))} sourcePrefix="example:" /></CardContent></Card>
  </div>;
}