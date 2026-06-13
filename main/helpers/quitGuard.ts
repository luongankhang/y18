import { app, BrowserWindow, ipcMain } from 'electron';

let allowQuit = false;
let quitDialogPending = false;
let mainWindowRef: BrowserWindow | null = null;

function promptQuitConfirmation() {
  const win = mainWindowRef;
  if (allowQuit || !win || win.isDestroyed()) {
    return;
  }
  if (quitDialogPending) {
    return;
  }

  quitDialogPending = true;
  win.show();
  win.focus();
  win.webContents.send('show-quit-dialog');
}

export function requestQuit() {
  promptQuitConfirmation();
}

export function allowApplicationQuit() {
  allowQuit = true;
}

export function setupQuitGuard(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow;

  mainWindow.on('close', (event) => {
    if (allowQuit) {
      return;
    }
    event.preventDefault();
    promptQuitConfirmation();
  });

  app.on('before-quit', (event) => {
    if (allowQuit) {
      return;
    }
    event.preventDefault();
    promptQuitConfirmation();
  });

  ipcMain.on('confirm-app-quit', () => {
    quitDialogPending = false;
    allowQuit = true;
    app.quit();
  });

  ipcMain.on('cancel-app-quit', () => {
    quitDialogPending = false;
  });
}
