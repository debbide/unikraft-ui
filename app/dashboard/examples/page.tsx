import { ExampleBuildForm } from '@/components/example-build-form';
import { listConversionJobs } from '@/app/actions/images';
import { ConversionJobs } from '@/components/conversion-jobs';
import { EXAMPLE_TEMPLATES, EXAMPLES_COMMIT } from '@/lib/examples/catalog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ExamplesPage() {
  const { jobs } = await listConversionJobs();
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">官方模板</h1><p className="mt-2 text-muted-foreground">基于 Unikraft Cloud 官方 examples 的固定版本构建，版本：{EXAMPLES_COMMIT.slice(0, 8)}。</p></div>
    <Card><CardHeader><CardTitle>构建官方示例</CardTitle></CardHeader><CardContent><ExampleBuildForm /><p className="mt-4 text-sm text-muted-foreground">已收录 {EXAMPLE_TEMPLATES.length} 个含 Kraftfile 的官方构建单元，按固定 commit 构建。</p><div className="mt-5 grid gap-2 md:grid-cols-3">{Array.from(new Set(EXAMPLE_TEMPLATES.map((item) => item.category))).map((category) => <div key={category} className="rounded border p-3 text-sm"><b>{category}</b><p className="text-muted-foreground">{EXAMPLE_TEMPLATES.filter((item) => item.category === category).length} 个模板</p></div>)}</div></CardContent></Card>
    <Card><CardHeader><CardTitle>构建任务</CardTitle></CardHeader><CardContent><ConversionJobs initialJobs={jobs.filter((job) => job.sourceImage.startsWith('example:'))} sourcePrefix="example:" /></CardContent></Card>
  </div>;
}