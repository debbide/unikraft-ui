import { ReactNode } from 'react';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from '@/components/ui/sidebar';
import { Server, HardDrive, LayoutDashboard, LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50/50 dark:bg-gray-900/50">
        <Sidebar className="border-r border-border bg-card">
          <SidebarHeader className="p-4 border-b border-border">
            <h2 className="text-xl font-bold">UKC Panel</h2>
          </SidebarHeader>
          <SidebarContent className="p-2 gap-2 mt-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/dashboard" className="flex items-center gap-2" />}>
                  <LayoutDashboard className="w-5 h-5" />
                  <span>概览 (Overview)</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/dashboard/instances" className="flex items-center gap-2" />}>
                  <Server className="w-5 h-5" />
                  <span>实例 (Instances)</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/dashboard/volumes" className="flex items-center gap-2" />}>
                  <HardDrive className="w-5 h-5" />
                  <span>存储 (Volumes)</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-border">
            <form action={logout}>
              <Button variant="ghost" className="w-full flex justify-start gap-2 text-muted-foreground" type="submit">
                <LogOut className="w-4 h-4" />
                退出登录
              </Button>
            </form>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
