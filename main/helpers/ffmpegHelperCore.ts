import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { logMessage } from './storeManager';
import { timemarkToSeconds } from './fileUtils';
import { buildOutputPath, prepareUniqueOutputFile } from './outputPathUtils';
import {
  clearHelperCommand,
  normalizeHelperCommandError,
  registerHelperCommand,
} from './ffmpegHelperTaskManager';

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
  keepAudio?: boolean;
  videoPreset?: FfmpegEncodePreset;
  crf?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export interface ExtractAudioOptions {
  inputFile: string;
  outputFile: string;
  format: FfmpegHelperAudioFormat;
  audioBitrateKbps?: number;
  sampleRate?: number;
  channels?: number;
  audioTrackIndex?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export interface ConvertWhisperOptions {
  inputFile: string;
  outputFile: string;
  sampleRate: number;
  normalizeLoudness?: boolean;
  highPassHz?: number;
  removeSilence?: boolean;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export interface MergeVideosOptions {
  inputFiles: string[];
  outputFile: string;
  targetResolution?: FfmpegTargetResolution;
  targetFps?: number;
  videoPreset?: FfmpegEncodePreset;
  crf?: number;
  audioBitrateKbps?: number;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export type MergeAudioMode = 'mix' | 'replace';

export interface MergeAudioToVideoOptions {
  videoFile: string;
  audioFile: string;
  outputFile: string;
  mode: MergeAudioMode;
  /** 0 = mute, 1 = 100%, 2 = 200% */
  originalVolume: number;
  externalVolume: number;
  /** Positive = delay external audio; negative = trim start of external audio */
  audioOffsetSec: number;
  loopExternalAudio: boolean;
  copyVideo: boolean;
  fadeInSec?: number;
  fadeOutSec?: number;
  audioBitrateKbps?: number;
  videoPreset?: FfmpegEncodePreset;
  crf?: number;
  onProgress?: (progress: FfmpegHelperProgress) => void;
}

export type FfmpegEncodePreset = 'ultrafast' | 'fast' | 'medium' | 'slow';
export type FfmpegTargetResolution = '1080' | '720' | '480';
export type FfmpegHelperVideoFormat = 'mp4' | 'mkv' | 'mov';

interface MediaProbeResult {
  hasVideo: boolean;
  hasAudio: boolean;
}

function assertInputFile(inputFile: string): void {
  if (!inputFile || !fs.existsSync(inputFile)) {
    throw new Error('INPUT_FILE_NOT_FOUND');
  }
}

function prepareOutputFile(outputFile: string): string {
  return prepareUniqueOutputFile(outputFile);
}

const VALID_PRESETS: FfmpegEncodePreset[] = [
  'ultrafast',
  'fast',
  'medium',
  'slow',
];

function resolvePreset(preset?: FfmpegEncodePreset): FfmpegEncodePreset {
  if (preset && VALID_PRESETS.includes(preset)) {
    return preset;
  }
  return 'fast';
}

function resolveCrf(crf?: number): number {
  if (!Number.isFinite(crf)) {
    return 23;
  }
  return Math.min(28, Math.max(18, Math.round(crf as number)));
}

function resolveTargetResolution(res?: FfmpegTargetResolution): {
  w: number;
  h: number;
} {
  switch (res) {
    case '720':
      return { w: 1280, h: 720 };
    case '480':
      return { w: 854, h: 480 };
    case '1080':
    default:
      return { w: 1920, h: 1080 };
  }
}

function resolveTargetFps(fps?: number): number {
  if (fps === 24 || fps === 30 || fps === 60) {
    return fps;
  }
  return 30;
}

function resolveAudioBitrateKbps(bitrate?: number): number {
  if (!Number.isFinite(bitrate)) {
    return 192;
  }
  const value = Math.round(bitrate as number);
  if (value <= 128) return 128;
  if (value <= 192) return 192;
  if (value <= 256) return 256;
  return 320;
}

function applyTrimOptions(
  command: ffmpeg.FfmpegCommand,
  trimStartSec?: number,
  trimEndSec?: number,
): ffmpeg.FfmpegCommand {
  const trimStart = Math.max(0, trimStartSec ?? 0);
  const trimEnd = trimEndSec ?? 0;

  if (trimStart > 0) {
    command = command.setStartTime(trimStart);
  }

  if (trimEnd > 0 && trimEnd > trimStart) {
    command = command.setDuration(trimEnd - trimStart);
  }

  return command;
}

function appendAudioFadeFilter(
  filterComplex: string,
  fadeInSec: number,
  fadeOutSec: number,
  durationSec: number,
): { filterComplex: string; audioMap: string } {
  const fadeIn = Math.max(0, fadeInSec);
  const fadeOut = Math.max(0, fadeOutSec);

  if (fadeIn <= 0 && fadeOut <= 0) {
    return { filterComplex, audioMap: '[outa]' };
  }

  const fades: string[] = [];
  if (fadeIn > 0) {
    fades.push(`afade=t=in:st=0:d=${fadeIn}`);
  }
  if (fadeOut > 0 && durationSec > fadeOut) {
    fades.push(
      `afade=t=out:st=${Math.max(0, durationSec - fadeOut)}:d=${fadeOut}`,
    );
  }

  if (fades.length === 0) {
    return { filterComplex, audioMap: '[outa]' };
  }

  return {
    filterComplex: `${filterComplex};[outa]${fades.join(',')}[outa_final]`,
    audioMap: '[outa_final]',
  };
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
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearHelperCommand(command);
      fn();
    };

    registerHelperCommand(command);

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
        finish(resolve);
      })
      .on('error', (err) => {
        logMessage(`[ffmpeg helper] ${label} error: ${err}`, 'error');
        finish(() => reject(normalizeHelperCommandError(err)));
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
  const {
    inputFile,
    speed,
    keepAudio = true,
    videoPreset,
    crf,
    trimStartSec,
    trimEndSec,
    onProgress,
  } = options;
  assertInputFile(inputFile);

  if (!Number.isFinite(speed) || speed <= 0 || speed > 4) {
    throw new Error('INVALID_SPEED');
  }

  const trimStart = Math.max(0, trimStartSec ?? 0);
  const trimEnd = trimEndSec ?? 0;
  if (trimEnd > 0 && trimEnd <= trimStart) {
    throw new Error('INVALID_TRIM_RANGE');
  }

  const outputFile = prepareOutputFile(options.outputFile);
  const probe = await probeMedia(inputFile);

  if (!probe.hasVideo && !probe.hasAudio) {
    throw new Error('NO_MEDIA_STREAM');
  }

  let command = ffmpeg(inputFile);
  command = applyTrimOptions(command, trimStartSec, trimEndSec);

  if (probe.hasVideo) {
    command = command
      .videoFilters(`setpts=${1 / speed}*PTS`)
      .videoCodec('libx264')
      .outputOptions([
        '-preset',
        resolvePreset(videoPreset),
        '-crf',
        String(resolveCrf(crf)),
        '-pix_fmt',
        'yuv420p',
      ]);
  }

  if (probe.hasAudio && keepAudio) {
    command = command.audioFilters(buildAtempoFilter(speed)).audioCodec('aac');
  } else if (probe.hasVideo && !keepAudio) {
    command = command.noAudio();
  } else if (!probe.hasVideo && probe.hasAudio && keepAudio) {
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
  const {
    inputFile,
    format,
    audioBitrateKbps,
    sampleRate,
    channels,
    audioTrackIndex,
    trimStartSec,
    trimEndSec,
    onProgress,
  } = options;
  assertInputFile(inputFile);

  const trimStart = Math.max(0, trimStartSec ?? 0);
  const trimEnd = trimEndSec ?? 0;
  if (trimEnd > 0 && trimEnd <= trimStart) {
    throw new Error('INVALID_TRIM_RANGE');
  }

  const outputFile = prepareOutputFile(options.outputFile);
  const probe = await probeMedia(inputFile);

  if (!probe.hasAudio) {
    throw new Error('NO_AUDIO_STREAM');
  }

  const { codec, format: outputFormat } = getAudioCodecConfig(format);
  let command = ffmpeg(inputFile).noVideo().audioCodec(codec);
  command = applyTrimOptions(command, trimStartSec, trimEndSec);

  const trackIndex = Math.max(0, Math.round(audioTrackIndex ?? 0));
  if (trackIndex > 0) {
    command = command.outputOptions('-map', `0:a:${trackIndex}`);
  }

  if (sampleRate && sampleRate > 0) {
    command = command.audioFrequency(sampleRate);
  }

  if (channels === 1 || channels === 2) {
    command = command.audioChannels(channels);
  }

  if (
    audioBitrateKbps &&
    audioBitrateKbps > 0 &&
    (format === 'mp3' || format === 'aac' || format === 'm4a')
  ) {
    command = command.audioBitrate(
      `${resolveAudioBitrateKbps(audioBitrateKbps)}k`,
    );
  }

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
  const {
    inputFile,
    sampleRate,
    normalizeLoudness,
    highPassHz,
    removeSilence,
    onProgress,
  } = options;
  assertInputFile(inputFile);

  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 48000) {
    throw new Error('INVALID_SAMPLE_RATE');
  }

  const outputFile = prepareOutputFile(options.outputFile);
  const probe = await probeMedia(inputFile);

  if (!probe.hasAudio) {
    throw new Error('NO_AUDIO_STREAM');
  }

  const audioFilters: string[] = [];
  if (normalizeLoudness) {
    audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  }
  if (highPassHz && highPassHz > 0) {
    audioFilters.push(`highpass=f=${Math.round(highPassHz)}`);
  }
  if (removeSilence) {
    audioFilters.push(
      'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:stop_periods=-1:stop_duration=0.1:stop_threshold=-50dB',
    );
  }

  let command = ffmpeg(inputFile)
    .noVideo()
    .audioCodec('pcm_s16le')
    .audioFrequency(Math.round(sampleRate))
    .audioChannels(1)
    .format('wav');

  if (audioFilters.length > 0) {
    command = command.audioFilters(audioFilters.join(','));
  }

  await runFfmpegCommand(
    command,
    outputFile,
    `convert-whisper ${sampleRate}Hz`,
    onProgress,
  );

  return { outputFile };
}

function getOutputFormatFromPath(outputFile: string): string {
  const ext = path.extname(outputFile).toLowerCase();
  if (ext === '.mkv') return 'matroska';
  if (ext === '.mov') return 'mov';
  return 'mp4';
}

/** Build filter_complex graph for sequential video+audio concat. */
function buildSequentialConcatFilter(
  inputCount: number,
  probes: MediaProbeResult[],
  durations: number[],
  targetW: number,
  targetH: number,
  targetFps: number,
): string {
  const parts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < inputCount; i++) {
    const vLabel = `v${i}`;
    const aLabel = `a${i}`;

    parts.push(
      `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${targetFps},format=yuv420p[${vLabel}]`,
    );

    if (probes[i].hasAudio) {
      parts.push(
        `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[${aLabel}]`,
      );
    } else {
      const duration = Math.max(durations[i] || 1, 0.1);
      parts.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration},asetpts=PTS-STARTPTS[${aLabel}]`,
      );
    }

    concatInputs.push(`[${vLabel}][${aLabel}]`);
  }

  parts.push(
    `${concatInputs.join('')}concat=n=${inputCount}:v=1:a=1[outv][outa]`,
  );

  return parts.join(';');
}

function getMediaDurationSec(inputFile: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', inputFile], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', () => {
      const match = stderr.match(/Duration:\s(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (!match) {
        resolve(0);
        return;
      }

      resolve(
        parseInt(match[1], 10) * 3600 +
          parseInt(match[2], 10) * 60 +
          parseFloat(match[3]),
      );
    });
  });
}

/**
 * Merge multiple videos sequentially (v1 → v2 → v3 …) using filter_complex concat.
 */
export async function mergeVideosInOrder(
  options: MergeVideosOptions,
): Promise<{ outputFile: string }> {
  const {
    inputFiles,
    targetResolution,
    targetFps,
    videoPreset,
    crf,
    audioBitrateKbps,
    onProgress,
  } = options;

  if (!inputFiles?.length || inputFiles.length < 2) {
    throw new Error('MERGE_REQUIRES_MIN_TWO_FILES');
  }

  const probes: MediaProbeResult[] = [];
  for (const file of inputFiles) {
    assertInputFile(file);
    const probe = await probeMedia(file);
    if (!probe.hasVideo) {
      throw new Error('MERGE_REQUIRES_VIDEO');
    }
    probes.push(probe);
  }

  const outputFile = prepareOutputFile(options.outputFile);
  const durations = await Promise.all(inputFiles.map(getMediaDurationSec));
  const totalDurationSec = durations.reduce((sum, value) => sum + value, 0);
  const { w, h } = resolveTargetResolution(targetResolution);
  const fps = resolveTargetFps(targetFps);
  const filterComplex = buildSequentialConcatFilter(
    inputFiles.length,
    probes,
    durations,
    w,
    h,
    fps,
  );
  const outputFormat = getOutputFormatFromPath(outputFile);
  const preset = resolvePreset(videoPreset);
  const resolvedCrf = resolveCrf(crf);
  const audioBitrate = resolveAudioBitrateKbps(audioBitrateKbps);

  logMessage(
    `[ffmpeg helper] merge-videos order: ${inputFiles.map((f, i) => `${i + 1}:${path.basename(f)}`).join(' → ')} (${w}x${h}@${fps}fps)`,
    'info',
  );

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg();
    for (const file of inputFiles) {
      command = command.input(file);
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearHelperCommand(command);
      fn();
    };

    registerHelperCommand(command);

    command
      .outputOptions([
        '-filter_complex',
        filterComplex,
        '-map',
        '[outv]',
        '-map',
        '[outa]',
        '-c:v',
        'libx264',
        '-preset',
        preset,
        '-crf',
        String(resolvedCrf),
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        `${audioBitrate}k`,
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        '-y',
      ])
      .format(outputFormat)
      .on('start', (cmdLine) => {
        logMessage(`[ffmpeg helper] merge-videos start: ${cmdLine}`, 'info');
        onProgress?.({ percent: 0 });
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
        logMessage('[ffmpeg helper] merge-videos done', 'info');
        onProgress?.({ percent: 100 });
        finish(resolve);
      })
      .on('error', (err) => {
        logMessage(`[ffmpeg helper] merge-videos error: ${err}`, 'error');
        finish(() => reject(normalizeHelperCommandError(err)));
      })
      .save(outputFile);
  });

  return { outputFile };
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(2, Math.max(0, volume));
}

/** Build filter_complex graph to mix or replace audio on a video track. */
export function buildMergeAudioFilterComplex(
  mode: MergeAudioMode,
  hasOriginalAudio: boolean,
  originalVolume: number,
  externalVolume: number,
  audioOffsetSec: number,
  videoDurationSec: number,
  loopExternalAudio: boolean,
): string {
  const origVol = clampVolume(originalVolume);
  const extVol = clampVolume(externalVolume);
  const parts: string[] = [];
  let extIn = '[1:a]';

  if (loopExternalAudio && videoDurationSec > 0) {
    parts.push(`${extIn}aloop=loop=-1:size=2e+09[extloop]`);
    extIn = '[extloop]';
    parts.push(
      `${extIn}atrim=duration=${videoDurationSec},asetpts=PTS-STARTPTS[exttrim]`,
    );
    extIn = '[exttrim]';
  }

  const extSteps: string[] = [];
  if (audioOffsetSec > 0) {
    const ms = Math.round(audioOffsetSec * 1000);
    extSteps.push(`adelay=${ms}|${ms}`);
  } else if (audioOffsetSec < 0) {
    extSteps.push(
      `atrim=start=${Math.abs(audioOffsetSec)},asetpts=PTS-STARTPTS`,
    );
  }
  extSteps.push(
    `volume=${extVol},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`,
  );

  const extOutLabel = mode === 'replace' || !hasOriginalAudio ? 'outa' : 'ext';
  parts.push(`${extIn}${extSteps.join(',')}[${extOutLabel}]`);

  if (mode === 'replace' || !hasOriginalAudio) {
    return parts.join(';');
  }

  parts.push(
    `[0:a]volume=${origVol},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[orig]`,
  );
  parts.push(
    '[orig][ext]amix=inputs=2:duration=first:dropout_transition=0[outa]',
  );

  return parts.join(';');
}

/**
 * Merge external audio into a video with volume controls and optional sync utilities.
 */
export async function mergeAudioToVideo(
  options: MergeAudioToVideoOptions,
): Promise<{ outputFile: string }> {
  const {
    videoFile,
    audioFile,
    mode,
    originalVolume,
    externalVolume,
    audioOffsetSec,
    loopExternalAudio,
    copyVideo,
    fadeInSec,
    fadeOutSec,
    audioBitrateKbps,
    videoPreset,
    crf,
    onProgress,
  } = options;

  assertInputFile(videoFile);
  assertInputFile(audioFile);

  if (mode !== 'mix' && mode !== 'replace') {
    throw new Error('INVALID_MERGE_AUDIO_MODE');
  }

  if (
    !Number.isFinite(originalVolume) ||
    originalVolume < 0 ||
    originalVolume > 2 ||
    !Number.isFinite(externalVolume) ||
    externalVolume < 0 ||
    externalVolume > 2
  ) {
    throw new Error('INVALID_VOLUME');
  }

  if (
    !Number.isFinite(audioOffsetSec) ||
    audioOffsetSec < -3600 ||
    audioOffsetSec > 3600
  ) {
    throw new Error('INVALID_AUDIO_OFFSET');
  }

  const videoProbe = await probeMedia(videoFile);
  if (!videoProbe.hasVideo) {
    throw new Error('MERGE_AUDIO_REQUIRES_VIDEO');
  }

  const audioProbe = await probeMedia(audioFile);
  if (!audioProbe.hasAudio) {
    throw new Error('NO_EXTERNAL_AUDIO');
  }

  const outputFile = prepareOutputFile(options.outputFile);
  const videoDurationSec = await getMediaDurationSec(videoFile);
  let filterComplex = buildMergeAudioFilterComplex(
    mode,
    videoProbe.hasAudio,
    originalVolume,
    externalVolume,
    audioOffsetSec,
    videoDurationSec,
    loopExternalAudio,
  );
  const fadeResult = appendAudioFadeFilter(
    filterComplex,
    fadeInSec ?? 0,
    fadeOutSec ?? 0,
    videoDurationSec,
  );
  filterComplex = fadeResult.filterComplex;
  const audioMap = fadeResult.audioMap;
  const outputFormat = getOutputFormatFromPath(outputFile);
  const audioBitrate = resolveAudioBitrateKbps(audioBitrateKbps);
  const preset = resolvePreset(videoPreset);
  const resolvedCrf = resolveCrf(crf);

  logMessage(
    `[ffmpeg helper] merge-audio mode=${mode} origVol=${originalVolume} extVol=${externalVolume} offset=${audioOffsetSec}s loop=${loopExternalAudio}`,
    'info',
  );

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg().input(videoFile);

    if (loopExternalAudio) {
      command = command.input(audioFile).inputOptions(['-stream_loop', '-1']);
    } else {
      command = command.input(audioFile);
    }

    const outputOptions = [
      '-filter_complex',
      filterComplex,
      '-map',
      '0:v',
      '-map',
      audioMap,
      '-c:a',
      'aac',
      '-b:a',
      `${audioBitrate}k`,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-y',
    ];

    if (copyVideo) {
      outputOptions.push('-c:v', 'copy');
    } else {
      outputOptions.push(
        '-c:v',
        'libx264',
        '-preset',
        preset,
        '-crf',
        String(resolvedCrf),
        '-pix_fmt',
        'yuv420p',
      );
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearHelperCommand(command);
      fn();
    };

    registerHelperCommand(command);

    command
      .outputOptions(outputOptions)
      .format(outputFormat)
      .on('start', (cmdLine) => {
        logMessage(`[ffmpeg helper] merge-audio start: ${cmdLine}`, 'info');
        onProgress?.({ percent: 0 });
      })
      .on('progress', (progress) => {
        let percent = progress.percent;

        if (
          (percent === undefined ||
            percent === null ||
            Number.isNaN(percent) ||
            percent <= 0) &&
          videoDurationSec > 0 &&
          progress.timemark
        ) {
          percent =
            (timemarkToSeconds(progress.timemark) / videoDurationSec) * 100;
        }

        const safePercent = Math.min(
          100,
          Math.max(0, Math.round(percent || 0)),
        );
        onProgress?.({ percent: safePercent, timemark: progress.timemark });
      })
      .on('end', () => {
        logMessage('[ffmpeg helper] merge-audio done', 'info');
        onProgress?.({ percent: 100 });
        finish(resolve);
      })
      .on('error', (err) => {
        logMessage(`[ffmpeg helper] merge-audio error: ${err}`, 'error');
        finish(() => reject(normalizeHelperCommandError(err)));
      })
      .save(outputFile);
  });

  return { outputFile };
}

/** Build default unique output file path for helper tab actions. */
export function buildHelperOutputPath(
  outputFolder: string,
  inputFile: string,
  suffix: string,
  extension: string,
): string {
  return buildOutputPath({
    outputFolder,
    inputFile,
    suffix,
    extension,
    ensureUnique: true,
  });
}
