'use client';

import { useActionState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { createVolume } from '@/app/actions/volumes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const metros = ['dal', 'sfo', 'was', 'fra', 'sin'];

export function CreateVolumeForm() {
  const [state, action, pending] = useActionState(createVolume, null);

  return (
    <form action={action} className="rounded-md border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-52 gap-2">
          <Label htmlFor="volume-name">名称</Label>
          <Input id="volume-name" name="name" placeholder="例如 data-minebot" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="volume-metro">Metro</Label>
          <Select name="metro" defaultValue="sin" required>
            <SelectTrigger id="volume-metro" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metros.map((metro) => (
                <SelectItem key={metro} value={metro}>
                  {metro.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="volume-size">容量</Label>
          <Input
            id="volume-size"
            name="size"
            defaultValue="1G"
            pattern="[0-9]+(M|G|MiB|GiB)"
            placeholder="例如 1G"
            required
            className="w-36"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          {pending ? '创建中' : '创建存储卷'}
        </Button>
      </div>
      <div aria-live="polite" className="mt-3 min-h-5 text-sm">
        {state?.error && <span className="whitespace-pre-wrap text-red-600">{state.error}</span>}
        {state?.success && <span className="text-green-600">创建成功，列表已更新。</span>}
      </div>
    </form>
  );
}
