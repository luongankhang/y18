import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  buildHelperOutputPath,
  changeMediaSpeed,
  convertToWhisperFormat,
  extractMediaAudio,
  mergeAudioToVideo,
  mergeVideosInOrder,
  type FfmpegHelperAudioFormat,
} from './ffmpegHelperCore';
import { previewUniqueOutputPath } from './outputPathUtils';
import { cancelActiveHelperTask } from './ffmpegHelperTaskManager';

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
    case 'MERGE_REQUIRES_MIN_TWO_FILES':
      return 'MERGE_REQUIRES_MIN_TWO_FILES';
    case 'MERGE_REQUIRES_VIDEO':
      return 'MERGE_REQUIRES_VIDEO';
    case 'INVALID_VOLUME':
      return 'INVALID_VOLUME';
    case 'INVALID_AUDIO_OFFSET':
      return 'INVALID_AUDIO_OFFSET';
    case 'INVALID_MERGE_AUDIO_MODE':
      return 'INVALID_MERGE_AUDIO_MODE';
    case 'MERGE_AUDIO_REQUIRES_VIDEO':
      return 'MERGE_AUDIO_REQUIRES_VIDEO';
    case 'NO_EXTERNAL_AUDIO':
      return 'NO_EXTERNAL_AUDIO';
    case 'INVALID_TRIM_RANGE':
      return 'INVALID_TRIM_RANGE';
    case 'FFMPEG_HELPER_CANCELLED':
      return 'FFMPEG_HELPER_CANCELLED';
    case 'NO_ACTIVE_HELPER_TASK':
      return 'NO_ACTIVE_HELPER_TASK';
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

  ipcMain.handle('select-video-files', async () => {
    return dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm', 'flv', 'wmv', 'ts'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });
  });

  ipcMain.handle('ffmpeg-cancel-task', async () => {
    const cancelled = cancelActiveHelperTask();
    if (!cancelled) {
      throw new Error('NO_ACTIVE_HELPER_TASK');
    }
    return { success: true };
  });

  ipcMain.handle('ffmpeg-merge-audio', async (event, options) => {
    try {
      const {
        videoFile,
        audioFile,
        outputFile,
        mode,
        originalVolume,
        externalVolume,
        audioOffsetSec,
        loopExternalAudio,
        copyVideo,
      } = options;
      const result = await mergeAudioToVideo({
        videoFile,
        audioFile,
        outputFile,
        mode,
        originalVolume: Number(originalVolume),
        externalVolume: Number(externalVolume),
        audioOffsetSec: Number(audioOffsetSec),
        loopExternalAudio: Boolean(loopExternalAudio),
        copyVideo: copyVideo !== false,
        fadeInSec: Number(options.fadeInSec ?? 0),
        fadeOutSec: Number(options.fadeOutSec ?? 0),
        audioBitrateKbps: Number(options.audioBitrateKbps ?? 192),
        videoPreset: options.videoPreset,
        crf: Number(options.crf ?? 23),
        onProgress: ({ percent }) => {
          sendHelperProgress(event, { task: 'merge-audio', percent });
        },
      });
      return { success: true, outputFile: result.outputFile };
    } catch (error) {
      throw new Error(mapHelperError(error));
    }
  });

  ipcMain.handle('ffmpeg-merge-videos', async (event, options) => {
    try {
      const { inputFiles, outputFile } = options;
      const result = await mergeVideosInOrder({
        inputFiles,
        outputFile,
        targetResolution: options.targetResolution,
        targetFps: Number(options.targetFps ?? 30),
        videoPreset: options.videoPreset,
        crf: Number(options.crf ?? 23),
        audioBitrateKbps: Number(options.audioBitrateKbps ?? 192),
        onProgress: ({ percent }) => {
          sendHelperProgress(event, { task: 'merge-videos', percent });
        },
      });
      return { success: true, outputFile: result.outputFile };
    } catch (error) {
      throw new Error(mapHelperError(error));
    }
  });

  ipcMain.handle('ffmpeg-change-speed', async (event, options) => {
    try {
      const { inputFile, outputFile, speed } = options;
      const result = await changeMediaSpeed({
        inputFile,
        outputFile,
        speed: Number(speed),
        keepAudio: options.keepAudio !== false,
        videoPreset: options.videoPreset,
        crf: Number(options.crf ?? 23),
        trimStartSec: Number(options.trimStartSec ?? 0),
        trimEndSec: Number(options.trimEndSec ?? 0),
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
        audioBitrateKbps: Number(options.audioBitrateKbps ?? 192),
        sampleRate: Number(options.sampleRate ?? 0),
        channels: Number(options.channels ?? 0),
        audioTrackIndex: Number(options.audioTrackIndex ?? 0),
        trimStartSec: Number(options.trimStartSec ?? 0),
        trimEndSec: Number(options.trimEndSec ?? 0),
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
        normalizeLoudness: Boolean(options.normalizeLoudness),
        highPassHz: Number(options.highPassHz ?? 0),
        removeSilence: Boolean(options.removeSilence),
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
    const preview = previewUniqueOutputPath({
      outputFolder,
      inputFile,
      suffix,
      extension,
    });
    return (
      preview?.fullPath ??
      buildHelperOutputPath(outputFolder, inputFile, suffix, extension)
    );
  });

  ipcMain.handle('ffmpeg-preview-output-path', async (_event, options) => {
    const preview = previewUniqueOutputPath(options);
    if (!preview) {
      return null;
    }
    return {
      fullPath: preview.fullPath,
      fileName: preview.fileName,
      duplicateIndex: preview.duplicateIndex,
    };
  });
}
