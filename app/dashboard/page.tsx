import { getToken } from '@/app/actions/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const token = await getToken();
  
  if (!token) {
    return <div>Unauthorized</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">概览 (Overview)</h1>
        <p className="text-muted-foreground mt-2">欢迎来到 Unikraft Cloud WebUI。您的 Token 已成功验证！</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">API 连接成功</div>
            <p className="text-xs text-muted-foreground mt-1">您现在可以管理实例了</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
