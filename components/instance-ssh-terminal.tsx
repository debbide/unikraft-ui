'use client';

import { useEffect, useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ServerMessage =
  | { type: 'output'; data: string }
  | { type: 'status'; status: string }
  | { type: 'error'; message: string };

export function InstanceSshTerminal({ uuid, metro, name }: { uuid: string; metro: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('未连接');
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !container) return;
    const terminal = new Terminal({ cursorBlink: true, convertEol: true, fontSize: 14, theme: { background: '#09090b' } });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    fit.fit();
    terminal.focus();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/ssh`);
    const sendResize = () => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    };
    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(container);
    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
    });

    terminal.writeln('\x1b[90m正在连接 SSH 网关...\x1b[0m');
    socket.addEventListener('open', () => {
      terminal.writeln('\x1b[90m正在验证实例并建立 SSH 会话...\x1b[0m');
      socket.send(JSON.stringify({ type: 'connect', uuid, metro }));
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'output') terminal.write(message.data);
        if (message.type === 'status') {
          setStatus(message.status === 'connected' ? '已连接' : '正在验证');
          if (message.status === 'connected') sendResize();
        }
        if (message.type === 'error') {
          setStatus('连接失败');
          terminal.writeln(`\r\n\x1b[31m${message.message}\x1b[0m`);
        }
      } catch {
        terminal.writeln('\r\n\x1b[31m终端服务返回了无效消息。\x1b[0m');
      }
    });
    socket.addEventListener('close', (event) => {
      setStatus((current) => current === '连接失败' ? current : '已断开');
      const reason = event.reason ? `：${event.reason}` : '';
      terminal.writeln(`\r\n\x1b[33m连接已断开${reason}\x1b[0m`);
    });
    socket.addEventListener('error', () => {
      setStatus('连接失败');
      terminal.writeln('\r\n\x1b[31m无法连接 SSH 网关。请确认应用通过 node server.mjs 启动，并且反向代理已启用 /ws/ssh 的 WebSocket Upgrade。\x1b[0m');
    });

    return () => {
      resizeObserver.disconnect();
      input.dispose();
      socket.close();
      terminal.dispose();
    };
  }, [open, container, uuid, metro]);

  return (
    <>
      <Button type="button" size="sm" variant="outline" title="打开 SSH 终端" onClick={() => { setStatus('连接中'); setOpen(true); }}>
        <TerminalSquare className="size-4" />
        终端
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[82vh] max-h-[900px] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-3 overflow-hidden bg-zinc-950 p-4 text-zinc-100">
          <DialogHeader>
            <DialogTitle>{name} SSH 终端</DialogTitle>
            <DialogDescription className="text-zinc-400">{metro.toUpperCase()} · {status}</DialogDescription>
          </DialogHeader>
          <div ref={setContainer} className="min-h-0 flex-1 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 p-2" />
        </DialogContent>
      </Dialog>
    </>
  );
}
