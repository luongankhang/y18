import { BrowserWindow, ipcMain, app } from 'electron';
import * as os from 'os';
import * as path from 'path';

type IPty = import('node-pty').IPty;

interface TerminalSession {
  id: string;
  pty: IPty;
}

const sessions = new Map<string, TerminalSession>();
let mainWindowRef: BrowserWindow | null = null;
let ptyModule: typeof import('node-pty') | null = null;

function loadPtyModule(): typeof import('node-pty') | null {
  if (ptyModule) return ptyModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ptyModule = require('node-pty');
    return ptyModule;
  } catch (error) {
    console.error('Failed to load node-pty:', error);
    return null;
  }
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function getShellArgs(shell: string): string[] {
  const base = path.basename(shell).toLowerCase();
  if (base.includes('powershell') || base === 'pwsh.exe' || base === 'pwsh') {
    return ['-NoLogo'];
  }
  if (base === 'cmd.exe') {
    return [];
  }
  return ['-l'];
}

function getDefaultCwd(): string {
  return app.getPath('home') || os.homedir();
}

function sendToRenderer(channel: string, payload: unknown) {
  const win = mainWindowRef;
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function killSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.pty.kill();
  } catch {
    // ignore
  }
  sessions.delete(id);
}

export function setupTerminalHandlers(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow;

  ipcMain.handle(
    'terminal:create',
    async (
      _event,
      options: { id: string; cols?: number; rows?: number; cwd?: string },
    ) => {
      const pty = loadPtyModule();
      if (!pty) {
        throw new Error('node-pty is not available');
      }

      const id = options.id;
      if (sessions.has(id)) {
        killSession(id);
      }

      const shell = getDefaultShell();
      const cols = Math.max(2, options.cols || 80);
      const rows = Math.max(2, options.rows || 24);
      const cwd = options.cwd || getDefaultCwd();

      const instance = pty.spawn(shell, getShellArgs(shell), {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
      });

      sessions.set(id, { id, pty: instance });

      instance.onData((data) => {
        sendToRenderer('terminal:data', { id, data });
      });

      instance.onExit(({ exitCode }) => {
        sessions.delete(id);
        sendToRenderer('terminal:exit', { id, exitCode });
      });

      return {
        id,
        shell: path.basename(shell),
        cwd,
        cols,
        rows,
      };
    },
  );

  ipcMain.handle(
    'terminal:write',
    (_event, payload: { id: string; data: string }) => {
      const session = sessions.get(payload.id);
      session?.pty.write(payload.data);
    },
  );

  ipcMain.handle(
    'terminal:resize',
    (_event, payload: { id: string; cols: number; rows: number }) => {
      const session = sessions.get(payload.id);
      if (!session) return;
      session.pty.resize(Math.max(2, payload.cols), Math.max(2, payload.rows));
    },
  );

  ipcMain.handle('terminal:kill', (_event, payload: { id: string }) => {
    killSession(payload.id);
  });

  ipcMain.handle('terminal:kill-all', () => {
    for (const id of [...sessions.keys()]) {
      killSession(id);
    }
  });

  mainWindow.on('closed', () => {
    for (const id of [...sessions.keys()]) {
      killSession(id);
    }
    mainWindowRef = null;
  });
}

export function sendTerminalMenuAction(action: 'new' | 'toggle' | 'kill') {
  sendToRenderer('terminal:menu-action', { action });
}
