import { app, dialog, ipcMain } from 'electron';
import {
  cancelOmniVoiceJob,
  enqueueOmniVoiceBatch,
  enqueueOmniVoiceTts,
  listOmniVoiceJobs,
  probeOmniVoiceRuntime,
  resetOmniVoiceRuntime,
  stopOmniVoiceWorker,
} from './omnivoiceService';
import { store } from './storeManager';

export function setupOmniVoiceHandlers() {
  ipcMain.handle('omnivoice:runtime', () => probeOmniVoiceRuntime());
  ipcMain.handle('omnivoice:select-runtime', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn Python runtime có OmniVoice và Torch',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Python', extensions: ['exe'] }]
          : [{ name: 'Python', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    store.set('omnivoicePythonPath', result.filePaths[0]);
    resetOmniVoiceRuntime();
    return probeOmniVoiceRuntime();
  });
  ipcMain.handle('omnivoice:list', () => listOmniVoiceJobs());
  ipcMain.handle('omnivoice:generate', (_event, request) =>
    enqueueOmniVoiceTts(request),
  );
  ipcMain.handle('omnivoice:generate-batch', (_event, request) =>
    enqueueOmniVoiceBatch(request),
  );
  ipcMain.handle('omnivoice:cancel', (_event, id: string) =>
    cancelOmniVoiceJob(id),
  );
  app.once('before-quit', stopOmniVoiceWorker);
}
