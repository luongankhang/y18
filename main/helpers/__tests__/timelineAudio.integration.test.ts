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
import { serializeProjectSubtitleSrt } from '../../../types/timelineSubtitle.ts';

function run(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, cwd });
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

test(
  'real FFmpeg burn shows subtitle only inside its mapped cue interval',
  { timeout: 30_000 },
  async () => {
    assert.ok(ffmpegPath);
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'y18-subtitle-export-'),
    );
    const subtitleFile = path.join(tempDir, 'subtitle.srt');
    const output = path.join(tempDir, 'burned.mkv');
    const subtitleClip: TimelineClip = {
      id: 'subtitle-clip',
      source: subtitleFile,
      sourceFile: subtitleFile,
      startTime: 0,
      duration: 3,
      trimStart: 0,
      trimEnd: 0,
      playbackRate: 1,
      volume: 1,
      subtitleTimingMode: 'absolute',
      subtitleCues: [
        {
          id: 'cue',
          text: 'Kiểm tra phụ đề',
          sourceStartSec: 1,
          sourceEndSec: 2,
        },
      ],
    };
    const subtitleTrack: TimelineTrack = {
      id: 'subtitle-track',
      type: 'subtitle',
      name: 'Subtitle',
      order: 0,
      muted: false,
      hidden: false,
      locked: false,
      volume: 1,
      clips: [subtitleClip],
    };
    try {
      await fs.promises.writeFile(
        subtitleFile,
        serializeProjectSubtitleSrt({ duration: 3, tracks: [subtitleTrack] }),
        'utf8',
      );
      await run(
        ffmpegPath,
        [
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=320x180:r=10:d=3',
          '-vf',
          'subtitles=subtitle.srt',
          '-c:v',
          'ffv1',
          '-y',
          output,
        ],
        tempDir,
      );
      const frameHash = (time: string) =>
        run(
          ffmpegPath,
          ['-ss', time, '-i', output, '-frames:v', '1', '-f', 'md5', '-'],
          tempDir,
        );
      const [before, inside, after] = await Promise.all([
        frameHash('0.5'),
        frameHash('1.5'),
        frameHash('2.5'),
      ]);
      assert.equal(before.trim(), after.trim());
      assert.notEqual(inside.trim(), before.trim());
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  },
);

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
  'real timeline export keeps a delayed OmniVoice WAV clip in the mix',
  { timeout: 30_000 },
  async () => {
    assert.ok(ffmpegPath);
    assert.ok(ffprobeStatic.path);
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'y18-omnivoice-export-'),
    );
    const inputVideo = path.join(tempDir, 'video.mp4');
    const ttsWav = path.join(tempDir, 'omnivoice.wav');
    const output = path.join(tempDir, 'output.mp4');
    try {
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x180:r=24:d=2',
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        inputVideo,
      ]);
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=880:sample_rate=24000:duration=0.4',
        '-c:a',
        'pcm_s16le',
        '-y',
        ttsWav,
      ]);
      const video: TimelineTrack = {
        ...videoTrack(inputVideo),
        clips: [
          {
            ...(videoTrack(inputVideo).clips[0] as TimelineClip),
            duration: 2,
            inputIndex: 0,
            hasAudio: false,
          } as IndexedTimelineClip,
        ],
      };
      const audioClip: IndexedTimelineClip = {
        id: 'tts-clip',
        source: ttsWav,
        sourceFile: ttsWav,
        startTime: 1,
        duration: 0.4,
        trimStart: 0,
        trimEnd: 0,
        volume: 1,
        inputIndex: 1,
        hasAudio: true,
        metadata: {
          generator: 'omnivoice',
          modelId: 'k2-fsa/OmniVoice',
          text: 'test',
        },
      };
      const audio: TimelineTrack = {
        id: 'audio-track',
        type: 'audio',
        name: 'Voice',
        order: 1,
        muted: false,
        hidden: false,
        locked: false,
        volume: 1,
        clips: [audioClip],
      };
      const graph = [
        buildTimelineVideoGraph([video], 2, 320, 180, 24),
        buildTimelineAudioGraph([audio], 2),
      ].join(';');
      await run(ffmpegPath, [
        '-i',
        inputVideo,
        '-i',
        ttsWav,
        '-filter_complex',
        graph,
        '-map',
        '[outv]',
        '-map',
        '[outa]',
        '-t',
        '2',
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
      assert.ok(
        Number(probe.format.duration) >= 1.9 &&
          Number(probe.format.duration) <= 2.1,
      );
      assert.match(buildTimelineAudioGraph([audio], 2), /adelay=1000\|1000/);
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  },
);

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
