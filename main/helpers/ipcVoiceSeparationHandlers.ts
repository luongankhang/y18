import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import {
  cancelVoiceJob,
  enqueueVoiceJobs,
  initializeVoiceSeparationQueue,
  listVoiceJobs,
  probeVoiceRuntime,
  retryVoiceJob,
  stopVoiceSeparationQueue,
} from './voiceSeparationService';

const modes = new Set(['vocals', 'four-stems']);
const devices = new Set(['auto', 'cpu', 'gpu']);
const models = new Set(['htdemucs', 'htdemucs_ft', 'mdx_q']);

export function setupVoiceSeparationHandlers() {
  initializeVoiceSeparationQueue();
  ipcMain.handle('voice-separation:runtime', () => probeVoiceRuntime());
  ipcMain.handle('voice-separation:list', () => listVoiceJobs());
  ipcMain.handle('voice-separation:enqueue', (_event, payload) => {
    if (!payload?.inputFiles?.length) throw new Error('VOICE_INPUT_REQUIRED');
    if (
      payload.inputFiles.some(
        (inputFile: unknown) =>
          typeof inputFile !== 'string' || !fs.existsSync(inputFile),
      )
    )
      throw new Error('VOICE_INPUT_NOT_FOUND');
    if (!payload.outputDirectory || !fs.existsSync(payload.outputDirectory))
      throw new Error('VOICE_OUTPUT_DIRECTORY_INVALID');
    if (!fs.statSync(payload.outputDirectory).isDirectory())
      throw new Error('VOICE_OUTPUT_DIRECTORY_INVALID');
    if (!modes.has(payload.mode)) throw new Error('VOICE_MODE_INVALID');
    if (!devices.has(payload.device)) throw new Error('VOICE_DEVICE_INVALID');
    if (!models.has(payload.modelId)) throw new Error('VOICE_MODEL_INVALID');
    return enqueueVoiceJobs(payload.inputFiles, payload);
  });
  ipcMain.handle('voice-separation:cancel', (_event, id) => cancelVoiceJob(id));
  ipcMain.handle('voice-separation:retry', (_event, id) => retryVoiceJob(id));
  ipcMain.handle('voice-separation:reveal', (_event, filePath) =>
    shell.showItemInFolder(filePath),
  );

  app.once('before-quit', stopVoiceSeparationQueue);
}
