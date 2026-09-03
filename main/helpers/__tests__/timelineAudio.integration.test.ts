import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import type {
  TimelineClip,
  TimelineTrack,
} from '../../../types/subtitleMerge.ts';
import {
  buildTimelineAudioGraph,
  buildTimelineVideoGraph,
  type IndexedTimelineClip,
} from '../timelineFilterGraph.ts';

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(`${path.basename(command)} exited ${code}: ${stderr}`),
        );
    });
  });
}

function videoTrack(sourceFile: string): TimelineTrack {
  const clip: IndexedTimelineClip = {
    id: 'video-clip',
    source: sourceFile,
    sourceFile,
    startTime: 0,
    duration: 1.2,
    trimStart: 0,
    trimEnd: 0,
    volume: 1,
    inputIndex: 0,
    hasAudio: true,
  };
  return {
    id: 'video-track',
    type: 'video',
    name: 'Video 1',
    order: 0,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips: [clip as TimelineClip],
  };
}

test(
  'FFmpeg timeline output preserves embedded video audio',
  { timeout: 30_000 },
  async () => {
    assert.ok(ffmpegPath, 'ffmpeg-static did not provide a binary');
    assert.ok(ffprobeStatic.path, 'ffprobe-static did not provide a binary');
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'y18-timeline-audio-'),
    );
    const input = path.join(tempDir, 'input.mp4');
    const output = path.join(tempDir, 'output.mp4');
    try {
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:r=24:d=1.2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=1.2',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-y',
        input,
      ]);

      const track = videoTrack(input);
      const graph = [
        buildTimelineVideoGraph([track], 1.2, 320, 180, 24),
        buildTimelineAudioGraph([track], 1.2),
      ].join(';');
      await run(ffmpegPath, [
        '-i',
        input,
        '-filter_complex',
        graph,
        '-map',
        '[outv]',
        '-map',
        '[outa]',
        '-t',
        '1.2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-y',
        output,
      ]);

      const probe = JSON.parse(
        await run(ffprobeStatic.path, [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          output,
        ]),
      );
      assert.ok(
        probe.streams.some((stream: any) => stream.codec_type === 'video'),
      );
      assert.ok(
        probe.streams.some((stream: any) => stream.codec_type === 'audio'),
      );
      assert.ok(Number(probe.format.duration) >= 1.1);
      assert.ok(Number(probe.format.duration) <= 1.4);
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  },
);
