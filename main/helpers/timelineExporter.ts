import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logMessage } from './storeManager';
import {
  detectSubtitleFormat,
  parseStartEndTime,
  parseSubtitleEntries,
} from './subtitleFormats';
import { escapeSubtitlePath, buildForceStyle } from './subtitleMerger';
import {
  buildTimelineAudioGraph,
  buildTimelineVideoGraph,
  type IndexedTimelineClip,
} from './timelineFilterGraph';
import type { TimelineExportConfig } from '../../types/subtitleMerge';
import { serializeProjectSubtitleSrt } from '../../types/timelineSubtitle';

const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
ffmpeg.setFfmpegPath(ffmpegPath);
const execFileAsync = promisify(execFile);

async function resolveVideoEncoder(mode: 'cpu' | 'gpu' = 'cpu') {
  if (mode !== 'gpu') return { name: 'libx264', hardware: false };
  const candidates =
    process.platform === 'darwin'
      ? ['h264_videotoolbox']
      : process.platform === 'win32'
        ? ['h264_nvenc', 'h264_amf', 'h264_qsv']
        : ['h264_nvenc', 'h264_vaapi', 'h264_qsv'];
  try {
    const { stdout } = await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-encoders',
    ]);
    const encoder = candidates.find((candidate) =>
      new RegExp(`\\s${candidate}\\s`).test(stdout),
    );
    if (encoder) return { name: encoder, hardware: true };
  } catch (error) {
    logMessage(`GPU encoder detection failed: ${error}`, 'warning');
  }
  logMessage('No compatible GPU video encoder found; using libx264', 'warning');
  return { name: 'libx264', hardware: false };
}

function safeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export async function createTimelineSubtitle(
  project: TimelineExportConfig['project'],
): Promise<string | null> {
  const hydratedProject = {
    ...project,
    tracks: await Promise.all(
      project.tracks.map(async (track) => ({
        ...track,
        clips: await Promise.all(
          track.clips.map(async (clip) => {
            if (
              track.type !== 'subtitle' ||
              clip.subtitleCues ||
              !fs.existsSync(clip.sourceFile)
            )
              return clip;
            const entries = parseSubtitleEntries(
              await fs.promises.readFile(clip.sourceFile, 'utf8'),
              detectSubtitleFormat(clip.sourceFile),
            );
            return {
              ...clip,
              subtitleTimingMode:
                clip.subtitleTimingMode || ('absolute' as const),
              subtitleCues: entries.map((entry, index) => {
                const range = parseStartEndTime(entry.startEndTime);
                return {
                  id: entry.id || `cue-${index}`,
                  text: entry.content.join('\n'),
                  sourceStartSec: range.startMs / 1000,
                  sourceEndSec: range.endMs / 1000,
                };
              }),
            };
          }),
        ),
      })),
    ),
  };
  const content = serializeProjectSubtitleSrt(hydratedProject);
  if (!content) return null;
  const file = path.join(
    os.tmpdir(),
    `y18-timeline-${Date.now()}-${Math.random().toString(16).slice(2)}.srt`,
  );
  await fs.promises.writeFile(file, content, 'utf8');
  return file;
}

export async function exportTimeline(
  config: TimelineExportConfig,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const project = config.project;
  const duration = Math.max(0.001, safeNumber(project.duration, 1));
  const width = Math.max(2, Math.round(config.width || 1920));
  const height = Math.max(2, Math.round(config.height || 1080));
  const fps = Math.max(1, Math.min(120, safeNumber(config.fps || 30, 30)));
  const tracks = project.tracks;
  const subtitleStyle = config.subtitleStyle || project.subtitleStyle;
  const blurMask = config.blurMask || project.blurMask;
  const clips = tracks.flatMap((track) =>
    track.clips.map((clip) => ({ track, clip })),
  );
  if (!clips.some(({ track }) => track.type === 'video'))
    throw new Error('TIMELINE_REQUIRES_VIDEO');
  for (const { clip } of clips) {
    if (!clip.sourceFile || !fs.existsSync(clip.sourceFile))
      throw new Error(`MEDIA_NOT_FOUND:${clip.sourceFile}`);
  }
  clips.forEach(
    ({ clip }, index) => ((clip as IndexedTimelineClip).inputIndex = index),
  );
  await Promise.all(
    clips
      .filter(({ track }) => track.type === 'audio' || track.type === 'video')
      .map(
        ({ clip }) =>
          new Promise<void>((resolve) => {
            ffmpeg.ffprobe(clip.sourceFile, (error, metadata) => {
              (clip as IndexedTimelineClip).hasAudio =
                !error &&
                metadata.streams.some(
                  (stream) => stream.codec_type === 'audio',
                );
              resolve();
            });
          }),
      ),
  );
  const videoTracks = tracks.filter((track) => track.type === 'video');
  const mediaTracks = tracks.filter(
    (track) => track.type === 'audio' || track.type === 'video',
  );
  const subtitleFile = await createTimelineSubtitle(project);
  const graphParts = [
    buildTimelineVideoGraph(
      videoTracks,
      duration,
      width,
      height,
      fps,
      blurMask,
    ),
    buildTimelineAudioGraph(mediaTracks, duration),
  ];
  if (subtitleFile) {
    const style = subtitleStyle
      ? `:force_style='${buildForceStyle(subtitleStyle)}'`
      : '';
    graphParts.push(
      `[outv]subtitles='${escapeSubtitlePath(subtitleFile)}'${style}[finalv]`,
    );
  }
  const videoLabel = subtitleFile ? '[finalv]' : '[outv]';
  const requestedMode = config.renderMode || 'cpu';
  const encoder = await resolveVideoEncoder(requestedMode);
  const runExport = (videoEncoder: string, hardware: boolean) =>
    new Promise<void>((resolve, reject) => {
      const exportCommand = ffmpeg();
      clips.forEach(({ clip }) => exportCommand.input(clip.sourceFile));
      const outputOptions = [
        '-filter_complex',
        graphParts.join(';'),
        '-map',
        videoLabel,
        '-map',
        '[outa]',
        '-t',
        String(duration),
        '-c:v',
        videoEncoder,
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-y',
      ];
      if (hardware) outputOptions.push('-b:v', '8M');
      exportCommand
        .outputOptions(outputOptions)
        .on('start', () => onProgress?.(0))
        .on('progress', (progress) =>
          onProgress?.(
            Math.min(99, Math.max(0, Math.round(progress.percent || 0))),
          ),
        )
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .save(config.outputPath);
    });
  try {
    await runExport(encoder.name, encoder.hardware);
  } catch (error) {
    if (requestedMode === 'gpu' && encoder.hardware) {
      logMessage(`GPU export failed; retrying with CPU: ${error}`, 'warning');
      await runExport('libx264', false);
    } else {
      throw error;
    }
  } finally {
    if (subtitleFile)
      await fs.promises.unlink(subtitleFile).catch(() => undefined);
  }
  logMessage(`Timeline export completed: ${config.outputPath}`, 'info');
  onProgress?.(100);
  return config.outputPath;
}
