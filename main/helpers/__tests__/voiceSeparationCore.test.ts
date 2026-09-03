import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDemucsArgs,
  canTransitionVoiceJob,
  parseDemucsProgress,
} from '../voiceSeparationCore.ts';

test('voice job state machine accepts only valid forward transitions', () => {
  assert.equal(canTransitionVoiceJob('queued', 'preparing'), true);
  assert.equal(canTransitionVoiceJob('separating', 'completed'), false);
  assert.equal(canTransitionVoiceJob('failed', 'queued'), true);
  assert.equal(canTransitionVoiceJob('completed', 'queued'), false);
});

test('Demucs progress parser clamps values and ignores unrelated output', () => {
  assert.equal(parseDemucsProgress('Separated track 42.5%'), 42.5);
  assert.equal(parseDemucsProgress('progress 140%'), 100);
  assert.equal(parseDemucsProgress('loading model'), null);
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
