import type ffmpeg from 'fluent-ffmpeg';
import { logMessage } from './storeManager';

let activeCommand: ffmpeg.FfmpegCommand | null = null;
let cancelRequested = false;

export function registerHelperCommand(command: ffmpeg.FfmpegCommand): void {
  activeCommand = command;
  cancelRequested = false;
}

export function clearHelperCommand(command?: ffmpeg.FfmpegCommand): void {
  if (!command || activeCommand === command) {
    activeCommand = null;
    cancelRequested = false;
  }
}

export function wasHelperCancelRequested(): boolean {
  return cancelRequested;
}

export function normalizeHelperCommandError(error: unknown): Error {
  if (wasHelperCancelRequested()) {
    return new Error('FFMPEG_HELPER_CANCELLED');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export function cancelActiveHelperTask(): boolean {
  if (!activeCommand) {
    return false;
  }

  cancelRequested = true;

  try {
    activeCommand.kill('SIGKILL');
    logMessage('[ffmpeg helper] task cancel requested', 'info');
    return true;
  } catch (error) {
    logMessage(`[ffmpeg helper] task cancel failed: ${error}`, 'error');
    cancelRequested = false;
    return false;
  }
}

export function hasActiveHelperTask(): boolean {
  return activeCommand !== null;
}
