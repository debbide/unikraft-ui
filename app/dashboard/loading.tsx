export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-label="正在加载">
      <div className="h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      <div className="h-48 animate-pulse rounded-lg border bg-card" />
    </div>
  );
}