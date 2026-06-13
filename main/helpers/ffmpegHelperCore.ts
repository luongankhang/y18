import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { logMessage } from './storeManager';
import { timemarkToSeconds } from './fileUtils';

const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
ffmpeg.setFfmpegPath(ffmpegPath);

export type FfmpegHelperAudioFormat = 'wav' | 'mp3' | 'aac' | 'flac' | 'm4a';

export interface FfmpegHelperProgress {
  percent: number;
  timemark?: string;
}

export interface ChangeSpeedOptions {
  inputFile: string;
  outputFile: string;
  speed: number;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export interface ExtractAudioOptions {
  inputFile: string;
  outputFile: string;
  format: FfmpegHelperAudioFormat;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export interface ConvertWhisperOptions {
  inputFile: string;
  outputFile: string;
  sampleRate: number;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

interface MediaProbeResult {
  hasVideo: boolean;
  hasAudio: boolean;
}

function assertInputFile(inputFile: string): void {
  if (!inputFile || !fs.existsSync(inputFile)) {
    throw new Error('INPUT_FILE_NOT_FOUND');
  }
}

function ensureOutputDirectory(outputFile: string): string {
  const normalized = path.normalize(outputFile);
  fs.mkdirSync(path.dirname(normalized), { recursive: true });
  return normalized;
}

/** Probe streams using ffmpeg -i (ffmpeg-static does not ship ffprobe). */
function probeMedia(inputFile: string): Promise<MediaProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', inputFile], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      logMessage(`ffmpeg helper probe spawn error: ${err}`, 'error');
      reject(err);
    });

    proc.on('close', () => {
      const hasVideo = /Stream #\d+:\d+[^\n]*Video:/i.test(stderr);
      const hasAudio = /Stream #\d+:\d+[^\n]*Audio:/i.test(stderr);

      if (!hasVideo && !hasAudio) {
        reject(new Error('NO_MEDIA_STREAM'));
        return;
      }

      resolve({ hasVideo, hasAudio });
    });
  });
}

function runFfmpegCommand(
  command: ffmpeg.FfmpegCommand,
  outputFile: string,
  label: string,
  onProgress?: (progress: FfmpegHelperProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let totalDurationSec = 0;

    command
      .outputOptions('-y')
      .on('start', (cmdLine) => {
        logMessage(`[ffmpeg helper] ${label} start: ${cmdLine}`, 'info');
        onProgress?.({ percent: 0 });
      })
      .on('codecData', (data) => {
        totalDurationSec = timemarkToSeconds(data?.duration);
      })
      .on('progress', (progress) => {
        let percent = progress.percent;

        if (
          (percent === undefined ||
            percent === null ||
            Number.isNaN(percent) ||
            percent <= 0) &&
          totalDurationSec > 0 &&
          progress.timemark
        ) {
          percent =
            (timemarkToSeconds(progress.timemark) / totalDurationSec) * 100;
        }

        const safePercent = Math.min(
          100,
          Math.max(0, Math.round(percent || 0)),
        );
        onProgress?.({ percent: safePercent, timemark: progress.timemark });
      })
      .on('end', () => {
        logMessage(`[ffmpeg helper] ${label} done`, 'info');
        onProgress?.({ percent: 100 });
        resolve();
      })
      .on('error', (err) => {
        logMessage(`[ffmpeg helper] ${label} error: ${err}`, 'error');
        reject(err);
      })
      .save(outputFile);
  });
}

/** Build atempo filter chain for speeds outside single-filter range (0.5–2.0). */
export function buildAtempoFilter(speed: number): string {
  if (speed <= 0) {
    throw new Error('INVALID_SPEED');
  }

  const filters: string[] = [];
  let remaining = speed;

  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }

  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }

  filters.push(`atempo=${remaining}`);
  return filters.join(',');
}

export function getAudioCodecConfig(format: FfmpegHelperAudioFormat): {
  codec: string;
  format?: string;
} {
  switch (format) {
    case 'mp3':
      return { codec: 'libmp3lame' };
    case 'aac':
      return { codec: 'aac' };
    case 'flac':
      return { codec: 'flac' };
    case 'm4a':
      return { codec: 'aac', format: 'ipod' };
    case 'wav':
    default:
      return { codec: 'pcm_s16le', format: 'wav' };
  }
}

/**
 * Change playback speed of video (with audio) or audio-only media.
 */
export async function changeMediaSpeed(
  options: ChangeSpeedOptions,
): Promise<{ outputFile: string }> {
  const { inputFile, speed, onProgress } = options;
  assertInputFile(inputFile);

  if (!Number.isFinite(speed) || speed <= 0 || speed > 4) {
    throw new Error('INVALID_SPEED');
  }

  const outputFile = ensureOutputDirectory(options.outputFile);
  const probe = await probeMedia(inputFile);

  if (!probe.hasVideo && !probe.hasAudio) {
    throw new Error('NO_MEDIA_STREAM');
  }

  let command = ffmpeg(inputFile);

  if (probe.hasVideo) {
    command = command.videoFilters(`setpts=${1 / speed}*PTS`);
  }

  if (probe.hasAudio) {
    command = command.audioFilters(buildAtempoFilter(speed));
  }

  await runFfmpegCommand(
    command,
    outputFile,
    `change-speed x${speed}`,
    onProgress,
  );

  return { outputFile };
}

/**
 * Extract audio track from media file to common audio formats.
 */
export async function extractMediaAudio(
  options: ExtractAudioOptions,
): Promise<{ outputFile: string }> {
  const { inputFile, format, onProgress } = options;
  assertInputFile(inputFile);

  const outputFile = ensureOutputDirectory(options.outputFile);
  const probe = await probeMedia(inputFile);

  if (!probe.hasAudio) {
    throw new Error('NO_AUDIO_STREAM');
  }

  const { codec, format: outputFormat } = getAudioCodecConfig(format);
  let command = ffmpeg(inputFile).noVideo().audioCodec(codec);

  if (outputFormat) {
    command = command.format(outputFormat);
  }

  await runFfmpegCommand(
    command,
    outputFile,
    `extract-audio ${format}`,
    onProgress,
  );

  return { outputFile };
}

/**
 * Convert audio to Whisper-friendly WAV (mono PCM, configurable sample rate).
 */
export async function convertToWhisperFormat(
  options: ConvertWhisperOptions,
): Promise<{ outputFile: string }> {
  const { inputFile, sampleRate, onProgress } = options;
  assertInputFile(inputFile);

  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 48000) {
    throw new Error('INVALID_SAMPLE_RATE');
  }

  const outputFile = ensureOutputDirectory(options.outputFile);
  const probe = await probeMedia(inputFile);

  if (!probe.hasAudio) {
    throw new Error('NO_AUDIO_STREAM');
  }

  const command = ffmpeg(inputFile)
    .noVideo()
    .audioCodec('pcm_s16le')
    .audioFrequency(Math.round(sampleRate))
    .audioChannels(1)
    .format('wav');

  await runFfmpegCommand(
    command,
    outputFile,
    `convert-whisper ${sampleRate}Hz`,
    onProgress,
  );

  return { outputFile };
}

/** Build default output file path for helper tab actions. */
export function buildHelperOutputPath(
  outputFolder: string,
  inputFile: string,
  suffix: string,
  extension: string,
): string {
  const inputFileName = path.basename(inputFile);
  const lastDotIndex = inputFileName.lastIndexOf('.');
  const baseName =
    lastDotIndex !== -1
      ? inputFileName.substring(0, lastDotIndex)
      : inputFileName;
  const ext = extension.startsWith('.') ? extension : `.${extension}`;

  return path.join(outputFolder, `${baseName}${suffix}${ext}`);
}
