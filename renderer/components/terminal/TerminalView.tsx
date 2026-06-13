/**
 * 单个 xterm 终端视图（连接 node-pty）
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export interface TerminalViewProps {
  terminalId: string;
  active: boolean;
  onTitleChange?: (id: string, title: string) => void;
}

export default function TerminalView({
  terminalId,
  active,
  onTitleChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const readyRef = useRef(false);
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  const fitTerminal = useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    if (!term || !fitAddon || !containerRef.current) return;
    if (
      containerRef.current.offsetWidth <= 0 ||
      containerRef.current.offsetHeight <= 0
    ) {
      return;
    }
    try {
      fitAddon.fit();
      if (readyRef.current) {
        window.ipc.invoke('terminal:resize', {
          id: terminalId,
          cols: term.cols,
          rows: term.rows,
        });
      }
    } catch {
      // container may be hidden
    }
  }, [terminalId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#cccccc',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fitAddon;

    let disposed = false;
    let sessionCreated = false;
    const cleanups: Array<() => void> = [];

    const bootstrap = async () => {
      try {
        fitAddon.fit();
        const result = await window.ipc.invoke('terminal:create', {
          id: terminalId,
          cols: Math.max(term.cols, 2),
          rows: Math.max(term.rows, 2),
        });
        if (disposed) return;
        sessionCreated = true;
        readyRef.current = true;
        onTitleChangeRef.current?.(terminalId, result.shell || 'Terminal');
        fitTerminal();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        term.writeln(`\x1b[31mTerminal failed to start: ${message}\x1b[0m`);
      }
    };

    bootstrap();

    const onData = term.onData((data) => {
      if (!readyRef.current) return;
      window.ipc.invoke('terminal:write', { id: terminalId, data });
    });
    cleanups.push(() => onData.dispose());

    cleanups.push(
      window.ipc.on(
        'terminal:data',
        (payload: { id: string; data: string }) => {
          if (payload.id === terminalId) {
            term.write(payload.data);
          }
        },
      ),
    );

    cleanups.push(
      window.ipc.on(
        'terminal:exit',
        (payload: { id: string; exitCode: number }) => {
          if (payload.id === terminalId) {
            readyRef.current = false;
            term.writeln(
              `\r\n\x1b[90m[Process exited with code ${payload.exitCode}]\x1b[0m`,
            );
          }
        },
      ),
    );

    const resizeObserver = new ResizeObserver(() => {
      if (active) fitTerminal();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      readyRef.current = false;
      resizeObserver.disconnect();
      cleanups.forEach((fn) => fn());
      if (sessionCreated) {
        window.ipc.invoke('terminal:kill', { id: terminalId }).catch(() => {});
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // 仅 terminalId 变化时重建会话，避免 StrictMode / 回调变化导致反复销毁
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]);

  useEffect(() => {
    if (active) {
      fitTerminal();
      termRef.current?.focus();
    }
  }, [active, fitTerminal]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 p-1 ${active ? 'block' : 'hidden'}`}
      onClick={() => termRef.current?.focus()}
    />
  );
}
