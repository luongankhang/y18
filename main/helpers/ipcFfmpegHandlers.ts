import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  buildHelperOutputPath,
  changeMediaSpeed,
  convertToWhisperFormat,
  extractMediaAudio,
  type FfmpegHelperAudioFormat,
} from './ffmpegHelperCore';

function sendHelperProgress(
  event: Electron.IpcMainInvokeEvent,
  payload: { task: string; percent: number },
) {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.webContents.send('ffmpeg-helper-progress', payload);
}

function mapHelperError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  switch (message) {
    case 'INPUT_FILE_NOT_FOUND':
      return 'INPUT_FILE_NOT_FOUND';
    case 'NO_AUDIO_STREAM':
      return 'NO_AUDIO_STREAM';
    case 'NO_MEDIA_STREAM':
      return 'NO_MEDIA_STREAM';
    case 'INVALID_SPEED':
      return 'INVALID_SPEED';
    case 'INVALID_SAMPLE_RATE':
      return 'INVALID_SAMPLE_RATE';
    default:
      return message || 'UNKNOWN_ERROR';
  }
}

export function setupFfmpegHandlers() {
  ipcMain.handle('select-file', async () => {
    return dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Media Files',
          extensions: [
            'mp4',
            'avi',
            'mkv',
            'mov',
            'webm',
            'mp3',
            'wav',
            'flac',
            'aac',
            'm4a',
            'ogg',
            'wma',
          ],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });
  });

  ipcMain.handle('select-folder', async () => {
    return dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
  });

  ipcMain.handle('ffmpeg-change-speed', async (event, options) => {
    try {
      const { inputFile, outputFile, speed } = options;
      const result = await changeMediaSpeed({
        inputFile,
        outputFile,
        speed: Number(speed),
        onProgress: ({ percent }) => {
          sendHelperProgress(event, { task: 'change-speed', percent });
        },
      });
      return { success: true, outputFile: result.outputFile };
    } catch (error) {
      throw new Error(mapHelperError(error));
    }
  });

  ipcMain.handle('ffmpeg-extract-audio', async (event, options) => {
    try {
      const { inputFile, outputFile, format } = options;
      const result = await extractMediaAudio({
        inputFile,
        outputFile,
        format: format as FfmpegHelperAudioFormat,
        onProgress: ({ percent }) => {
          sendHelperProgress(event, { task: 'extract-audio', percent });
        },
      });
      return { success: true, outputFile: result.outputFile };
    } catch (error) {
      throw new Error(mapHelperError(error));
    }
  });

  ipcMain.handle('ffmpeg-convert-whisper', async (event, options) => {
    try {
      const { inputFile, outputFile, sampleRate } = options;
      const result = await convertToWhisperFormat({
        inputFile,
        outputFile,
        sampleRate: Number(sampleRate),
        onProgress: ({ percent }) => {
          sendHelperProgress(event, { task: 'convert-whisper', percent });
        },
      });
      return { success: true, outputFile: result.outputFile };
    } catch (error) {
      throw new Error(mapHelperError(error));
    }
  });

  ipcMain.handle('ffmpeg-build-output-path', async (_event, options) => {
    const { outputFolder, inputFile, suffix, extension } = options;
    return buildHelperOutputPath(outputFolder, inputFile, suffix, extension);
  });
}
