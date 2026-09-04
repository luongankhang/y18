import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import { store } from './storeManager';
import { getModelsInstalled } from './whisper';
import { probeMedia } from './ffmpegHelperCore';
import {
  validateDemucsProcessingOptions,
  validateVoiceSpeed,
} from './voiceSeparationCore';
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
const models = new Set([
  'htdemucs',
  'htdemucs_ft',
  'htdemucs_6s',
  'mdx_extra',
  'mdx_q',
  'mdx_extra_q',
]);
const outputs = new Set(['voice', 'voice-video', 'karaoke-video']);

export function setupVoiceSeparationHandlers() {
  initializeVoiceSeparationQueue();
  ipcMain.handle('voice-separation:runtime', () => probeVoiceRuntime());
  ipcMain.handle('voice-separation:select-runtime', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn Python runtime có Demucs và Torch',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Python', extensions: ['exe'] }]
          : [{ name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    store.set('voiceSeparationPythonPath', result.filePaths[0]);
    return probeVoiceRuntime();
  });
  ipcMain.handle('voice-separation:list', () => listVoiceJobs());
  ipcMain.handle('voice-separation:whisper-models', () => getModelsInstalled());
  ipcMain.handle('voice-separation:enqueue', async (_event, payload) => {
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
    if (
      !Array.isArray(payload.outputs) ||
      !payload.outputs.length ||
      payload.outputs.some((output: unknown) => !outputs.has(String(output)))
    )
      throw new Error('VOICE_OUTPUT_PRESET_INVALID');
    validateVoiceSpeed(Number(payload.speed));
    if (!payload.demucs || typeof payload.demucs !== 'object')
      throw new Error('VOICE_DEMUCS_OPTIONS_INVALID');
    validateDemucsProcessingOptions(payload.demucs);
    if (
      !payload.transcription ||
      typeof payload.transcription.enabled !== 'boolean' ||
      typeof payload.transcription.model !== 'string' ||
      typeof payload.transcription.language !== 'string'
    )
      throw new Error('VOICE_TRANSCRIPTION_INVALID');
    if (
      payload.transcription.enabled &&
      !getModelsInstalled().includes(payload.transcription.model)
    )
      throw new Error('WHISPER_MODEL_MISSING');
    if (
      typeof payload.keepPitch !== 'boolean' ||
      typeof payload.keepStems !== 'boolean'
    )
      throw new Error('VOICE_OPTIONS_INVALID');
    const media = await Promise.all(
      payload.inputFiles.map((inputFile: string) => probeMedia(inputFile)),
    );
    if (media.some((item) => !item.hasAudio))
      throw new Error('NO_AUDIO_STREAM');
    const needsVideo = payload.outputs.some(
      (output: string) =>
        output === 'voice-video' || output === 'karaoke-video',
    );
    if (needsVideo && media.some((item) => !item.hasVideo))
      throw new Error('VOICE_VIDEO_OUTPUT_REQUIRES_VIDEO');
    return enqueueVoiceJobs(payload.inputFiles, payload);
  });
  ipcMain.handle('voice-separation:cancel', (_event, id) => cancelVoiceJob(id));
  ipcMain.handle('voice-separation:retry', (_event, id) => retryVoiceJob(id));
  ipcMain.handle('voice-separation:reveal', (_event, filePath) =>
    shell.showItemInFolder(filePath),
  );

  app.once('before-quit', stopVoiceSeparationQueue);
}
