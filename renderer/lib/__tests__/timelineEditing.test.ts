import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineClip } from '../../../types/subtitleMerge.ts';
import { trimTimelineClip } from '../timelineEditing.ts';

const clip: TimelineClip = {
  id: 'clip',
  source: 'media://clip',
  sourceFile: 'clip.mp4',
  startTime: 2,
  duration: 10,
  trimStart: 0,
  trimEnd: 0,
  volume: 1,
};

test('left trim moves the timeline start and source start without changing the file', () => {
  const trimmed = trimTimelineClip(clip, 'start', 3);
  assert.equal(trimmed.startTime, 5);
  assert.equal(trimmed.trimStart, 3);
  assert.equal(trimmed.duration, 7);
  assert.equal(trimmed.sourceFile, clip.sourceFile);
});

test('right trim keeps start time and shortens only the tail', () => {
  const trimmed = trimTimelineClip(clip, 'end', -2);
  assert.equal(trimmed.startTime, clip.startTime);
  assert.equal(trimmed.trimStart, 0);
  assert.equal(trimmed.trimEnd, 0);
  const shorter = trimTimelineClip(clip, 'end', 2);
  assert.equal(shorter.startTime, clip.startTime);
  assert.equal(shorter.trimEnd, 2);
});

test('trim clamps at zero and preserves a playable minimum', () => {
  const left = trimTimelineClip({ ...clip, startTime: 0 }, 'start', -4);
  assert.equal(left.startTime, 0);
  const right = trimTimelineClip(clip, 'end', 100);
  assert.ok(right.duration - right.trimEnd >= 0.05);
});
