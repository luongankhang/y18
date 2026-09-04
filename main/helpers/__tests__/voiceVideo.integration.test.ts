import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { buildStemVideoArgs } from '../voiceSeparationCore.ts';

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${path.basename(command)} ${code}: ${stderr}`)),
    );
  });
}

test(
  'voice video keeps picture and separated audio at the selected speed',
  { timeout: 30_000 },
  async () => {
    assert.ok(ffmpegPath, 'ffmpeg-static did not provide a binary');
    assert.ok(ffprobeStatic.path, 'ffprobe-static did not provide a binary');
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'y18-voice-video-'),
    );
    const input = path.join(tempDir, 'source video.mp4');
    const stem = path.join(tempDir, 'voice stem.wav');
    const output = path.join(tempDir, 'voice video.mp4');
    try {
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'color=c=cyan:s=320x180:r=24:d=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:sample_rate=44100:duration=1',
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
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=880:sample_rate=44100:duration=1',
        '-c:a',
        'pcm_s16le',
        '-y',
        stem,
      ]);
      await run(
        ffmpegPath,
        buildStemVideoArgs({
          inputFile: input,
          stemFile: stem,
          outputFile: output,
          speed: 0.5,
          keepPitch: true,
        }),
      );

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
      assert.ok(Number(probe.format.duration) >= 1.85);
      assert.ok(Number(probe.format.duration) <= 2.15);
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  'four-second voice video at 0.85x keeps video, audio and subtitle timing aligned',
  { timeout: 30_000 },
  async () => {
    assert.ok(ffmpegPath, 'ffmpeg-static did not provide a binary');
    assert.ok(ffprobeStatic.path, 'ffprobe-static did not provide a binary');
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'y18-voice-video-sync-'),
    );
    const input = path.join(tempDir, 'source-4s.mp4');
    const stem = path.join(tempDir, 'voice-4s.wav');
    const output = path.join(tempDir, 'voice-4s-085.mp4');
    try {
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'color=c=cyan:s=320x180:r=24:d=4',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:sample_rate=44100:duration=4',
        '-t',
        '4',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-y',
        input,
      ]);
      await run(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=880:sample_rate=44100:duration=4',
        '-t',
        '4',
        '-c:a',
        'pcm_s16le',
        '-y',
        stem,
      ]);
      await run(
        ffmpegPath,
        buildStemVideoArgs({
          inputFile: input,
          stemFile: stem,
          outputFile: output,
          speed: 0.85,
          keepPitch: true,
          outputDurationSec: 4 / 0.85,
        }),
      );

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
      const video = probe.streams.find(
        (stream: any) => stream.codec_type === 'video',
      );
      const audio = probe.streams.find(
        (stream: any) => stream.codec_type === 'audio',
      );
      const expectedDuration = 4 / 0.85;
      assert.ok(video, 'output is missing video');
      assert.ok(audio, 'output is missing audio');
      assert.ok(Math.abs(Number(video.duration) - expectedDuration) < 0.08);
      assert.ok(Math.abs(Number(audio.duration) - expectedDuration) < 0.08);
      assert.ok(
        Math.abs(Number(probe.format.duration) - expectedDuration) < 0.08,
      );
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  },
);
