'use client';

import { useState, useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deployInstance } from '@/app/actions/instances';
import { Loader2, Plus } from 'lucide-react';

const METROS = ['dal', 'sfo', 'was', 'fra', 'sin'];
type VolumeOption = { name: string; state?: string };

export function DeployModal({
  volumesByMetro = {},
  images = [],
}: {
  volumesByMetro?: Record<string, VolumeOption[]>;
  images?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [metro, setMetro] = useState('sin');
  const [state, formAction, pending] = useActionState(deployInstance, null as any);
  const availableVolumes = volumesByMetro[metro] || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="gap-2 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground h-9 px-4 py-2 text-sm font-medium hover:bg-primary/90">
        <Plus className="w-4 h-4"/> 部署新实例
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>部署新实例</DialogTitle>
          <DialogDescription>
            选择镜像、地区和配置，立即在 Unikraft Cloud 上拉起一个 MicroVM。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="image" className="text-right">镜像 (Image)</Label>
            <div className="col-span-3">
              <Select name="image" required>
                <SelectTrigger id="image" className="w-full">
                  <SelectValue placeholder={images.length ? '选择已转换镜像' : '暂无已转换镜像'} />
                </SelectTrigger>
                <SelectContent>
                  {images.map((image) => <SelectItem key={image} value={image}>{image}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="metro" className="text-right">地区 (Metro)</Label>
            <div className="col-span-3">
              <Select name="metro" value={metro} onValueChange={(value) => value && setMetro(value)} required>
                <SelectTrigger>
                  <SelectValue placeholder="选择区域" />
                </SelectTrigger>
                <SelectContent>
                  {METROS.map(m => (
                    <SelectItem key={m} value={m} className="uppercase">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="vcpu" className="text-right">核心 (vCPU)</Label>
            <Input id="vcpu" name="vcpu" type="number" defaultValue="1" min="1" max="16" className="col-span-3" required />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="memory_mb" className="text-right">内存 (Memory)</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Input id="memory_mb" name="memory_mb" type="number" defaultValue="512" min="128" step="128" required />
              <span className="text-sm text-muted-foreground">MB</span>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="volume_name" className="text-right">存储卷</Label>
            <div className="col-span-3">
              <Select key={metro} name="volume_name" defaultValue="__none">
                <SelectTrigger id="volume_name"><SelectValue placeholder={availableVolumes.length ? '选择已创建的存储卷' : '该 Metro 暂无可用存储卷'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">不挂载存储卷</SelectItem>
                  {availableVolumes.map((volume) => <SelectItem key={volume.name} value={volume.name}>{volume.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="volume_at" className="text-right">挂载路径</Label>
            <Input id="volume_at" name="volume_at" defaultValue="/app/server/data" placeholder="例如: /data" className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="env" className="text-right mt-2">环境变量 (Env)</Label>
            <div className="col-span-3">
              <textarea 
                id="env" 
                name="env" 
                placeholder="每行一个环境变量，例如：&#10;TOKEN=abc123&#10;PORT=8080" 
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ports" className="text-right">开放端口 (Ports)</Label>
            <Input id="ports" name="ports" placeholder="例如: 8080 或 443:8443 (公网:内部)" className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">名称 (可选)</Label>
            <Input id="name" name="name" placeholder="留空自动生成" className="col-span-3" />
          </div>

          {state?.error && (
            <div className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md">
              部署失败: {state.error}
            </div>
          )}
          {state?.success && (
            <div className="text-sm text-green-600 font-medium p-2 bg-green-50 rounded-md">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              一键部署
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
