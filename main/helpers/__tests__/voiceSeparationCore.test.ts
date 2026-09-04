import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDemucsArgs,
  buildStemVideoArgs,
  buildVoiceTempoFilter,
  canTransitionVoiceJob,
  parseDemucsProgress,
  parseNvidiaSmiCudaVersion,
  parseNvidiaSmiQueryOutput,
  validateDemucsProcessingOptions,
  validateVoiceSpeed,
  sortVoiceJobsForQueue,
} from '../voiceSeparationCore.ts';
import { retimeSrtContent } from '../subtitleFormats.ts';

test('voice job state machine accepts only valid forward transitions', () => {
  assert.equal(canTransitionVoiceJob('queued', 'preparing'), true);
  assert.equal(canTransitionVoiceJob('separating', 'completed'), false);
  assert.equal(canTransitionVoiceJob('failed', 'queued'), true);
  assert.equal(canTransitionVoiceJob('separating', 'transcribing'), true);
  assert.equal(canTransitionVoiceJob('transcribing', 'rendering'), true);
  assert.equal(canTransitionVoiceJob('rendering', 'partial'), true);
  assert.equal(canTransitionVoiceJob('partial', 'queued'), true);
  assert.equal(canTransitionVoiceJob('completed', 'queued'), false);
});

test('voice queue preserves FIFO order after jobs are restored', () => {
  const jobs = [
    { id: 'later', createdAt: 20 },
    { id: 'first', createdAt: 10 },
    { id: 'tie-b', createdAt: 30 },
    { id: 'tie-a', createdAt: 30 },
  ];
  assert.deepEqual(
    sortVoiceJobsForQueue(jobs).map((job) => job.id),
    ['first', 'later', 'tie-a', 'tie-b'],
  );
});

test('Demucs progress parser clamps values and ignores unrelated output', () => {
  assert.equal(parseDemucsProgress('Separated track 42.5%'), 42.5);
  assert.equal(parseDemucsProgress('progress 140%'), 100);
  assert.equal(parseDemucsProgress('loading model'), null);
});

test('NVIDIA probe parsers accept Windows nvidia-smi output variants', () => {
  assert.deepEqual(
    parseNvidiaSmiQueryOutput('NVIDIA GeForce RTX 3060, 610.62\r\n'),
    {
      gpuName: 'NVIDIA GeForce RTX 3060',
      driverVersion: '610.62',
    },
  );
  assert.equal(
    parseNvidiaSmiCudaVersion(
      '| NVIDIA-SMI 610.62                 KMD Version: 610.62        CUDA UMD Version: 13.3     |',
    ),
    '13.3',
  );
  assert.equal(
    parseNvidiaSmiCudaVersion('NVIDIA-SMI 555.85       CUDA Version: 12.5'),
    '12.5',
  );
});

test('Demucs arguments preserve paths as discrete spawn arguments', () => {
  const args = buildDemucsArgs({
    mode: 'vocals',
    modelId: 'htdemucs',
    device: 'gpu',
    outputDirectory: 'C:\\Đầu ra có khoảng trắng',
    inputFile: 'C:\\Video của tôi\\bài hát.mp4',
  });
  assert.deepEqual(args.slice(0, 8), [
    '-m',
    'demucs',
    '-n',
    'htdemucs',
    '-d',
    'cuda',
    '--out',
    'C:\\Đầu ra có khoảng trắng',
  ]);
  assert.equal(args.at(-1), 'C:\\Video của tôi\\bài hát.mp4');
  assert.deepEqual(args.slice(-3, -1), ['--two-stems', 'vocals']);
});

test('four-stem mode does not add a two-stem flag', () => {
  const args = buildDemucsArgs({
    mode: 'four-stems',
    modelId: 'htdemucs',
    device: 'cpu',
    outputDirectory: 'out',
    inputFile: 'input.wav',
  });
  assert.equal(args.includes('--two-stems'), false);
});

test('advanced Demucs options are emitted as discrete validated arguments', () => {
  const processing = validateDemucsProcessingOptions({
    shifts: 2,
    overlap: 0.25,
    segment: 7,
    jobs: 0,
    split: true,
    bitDepth: 'int24',
    clipMode: 'clamp',
  });
  const args = buildDemucsArgs({
    mode: 'vocals',
    modelId: 'htdemucs_ft',
    device: 'cpu',
    outputDirectory: 'out',
    inputFile: 'input.wav',
    processing,
  });
  assert.deepEqual(args.slice(args.indexOf('--shifts'), -3), [
    '--shifts',
    '2',
    '--overlap',
    '0.25',
    '--jobs',
    '0',
    '--clip-mode',
    'clamp',
    '--segment',
    '7',
    '--int24',
  ]);
});

test('voice speed and Demucs option validation rejects unsafe ranges', () => {
  assert.equal(validateVoiceSpeed(0.25), 0.25);
  assert.throws(() => validateVoiceSpeed(0.1), /VOICE_SPEED_INVALID/);
  assert.throws(
    () =>
      validateDemucsProcessingOptions({
        shifts: 11,
        overlap: 0.25,
        jobs: 0,
        split: true,
        bitDepth: 'int16',
        clipMode: 'rescale',
      }),
    /VOICE_SHIFTS_INVALID/,
  );
});

test('subtitle timestamps follow the exported video speed', () => {
  const content = '1\n00:00:02,000 --> 00:00:04,000\nHello\n\n';
  assert.match(retimeSrtContent(content, 0.5), /00:00:04,000 --> 00:00:08,000/);
  assert.match(retimeSrtContent(content, 2), /00:00:01,000 --> 00:00:02,000/);
});

test('four-second subtitle timing remains inside the 0.85x output duration', () => {
  const content = '1\n00:00:03,400 --> 00:00:04,000\nLast line\n\n';
  const retimed = retimeSrtContent(content, 0.85);
  assert.match(retimed, /00:00:04,000 --> 00:00:04,706/);
});

test('video deliverable maps source video and separated audio at one speed', () => {
  const args = buildStemVideoArgs({
    inputFile: 'source video.mp4',
    stemFile: 'vocals.wav',
    outputFile: 'voice video.mp4',
    speed: 0.5,
    keepPitch: true,
  });
  assert.deepEqual(args.slice(1, 5), [
    '-i',
    'source video.mp4',
    '-i',
    'vocals.wav',
  ]);
  assert.equal(args[args.indexOf('-vf') + 1], 'setpts=2*PTS');
  assert.equal(args[args.indexOf('-af') + 1], 'atempo=0.5');
  assert.equal(args.at(-1), 'voice video.mp4');
  assert.equal(buildVoiceTempoFilter(0.25, true), 'atempo=0.5,atempo=0.5');
  assert.equal(
    buildVoiceTempoFilter(1.5, false),
    'asetrate=44100*1.5,aresample=44100',
  );
});
