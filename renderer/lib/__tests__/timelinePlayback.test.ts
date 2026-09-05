import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  TimelineClip,
  TimelineTrack,
} from '../../../types/subtitleMerge.ts';
import {
  getTimelineClockTime,
  getTimelineMediaSyncDecision,
  getTimelinePlaybackState,
} from '../timelinePlayback.ts';
import { getSequentialClipStartTimes } from '../timelineQueue.ts';
import { splitTimelineClip } from '../timelineEditing.ts';

const baseClip: TimelineClip = {
  id: 'clip',
  source: 'media://video',
  sourceFile: 'video.mp4',
  startTime: 4,
  duration: 8,
  trimStart: 2,
  trimEnd: 1,
  volume: 0.5,
};

function track(
  type: TimelineTrack['type'],
  overrides: Partial<TimelineTrack> = {},
): TimelineTrack {
  return {
    id: type,
    type,
    name: type,
    order: 0,
    muted: false,
    hidden: false,
    locked: false,
    volume: 0.8,
    clips: [baseClip],
    ...overrides,
  };
}

test('video with embedded audio is visible, audible and source-time aligned', () => {
  const state = getTimelinePlaybackState(track('video'), baseClip, 7);
  assert.deepEqual(state, {
    inRange: true,
    visible: true,
    shouldRun: true,
    muted: false,
    volume: 0.4,
    sourceTime: 5,
  });
});

test('muted video keeps rendering while audio is disabled', () => {
  const state = getTimelinePlaybackState(
    track('video', { muted: true }),
    baseClip,
    7,
  );
  assert.equal(state.visible, true);
  assert.equal(state.shouldRun, true);
  assert.equal(state.muted, true);
});

test('hidden video can continue as an audio-only source', () => {
  const state = getTimelinePlaybackState(
    track('video', { hidden: true }),
    baseClip,
    7,
  );
  assert.equal(state.visible, false);
  assert.equal(state.shouldRun, true);
  assert.equal(state.muted, false);
});

test('hidden and muted video is fully inactive', () => {
  const state = getTimelinePlaybackState(
    track('video', { hidden: true, muted: true }),
    baseClip,
    7,
  );
  assert.equal(state.visible, false);
  assert.equal(state.shouldRun, false);
});

test('clip is inactive before start and after trim end', () => {
  assert.equal(
    getTimelinePlaybackState(track('video'), baseClip, 3.99).inRange,
    false,
  );
  assert.equal(
    getTimelinePlaybackState(track('video'), baseClip, 11).inRange,
    false,
  );
});

test('audio volume is clamped to the HTMLMediaElement range', () => {
  const loudClip = { ...baseClip, volume: 2 };
  const state = getTimelinePlaybackState(
    track('audio', { volume: 2 }),
    loudClip,
    7,
  );
  assert.equal(state.volume, 1);
});

test('master clock advances from its seek origin and clamps at duration', () => {
  assert.equal(getTimelineClockTime(5, 1_000, 2_500, 20), 6.5);
  assert.equal(getTimelineClockTime(19.5, 1_000, 3_000, 20), 20);
});

test('master clock ignores negative elapsed time and negative origin', () => {
  assert.equal(getTimelineClockTime(4, 2_000, 1_000, 20), 4);
  assert.equal(getTimelineClockTime(-3, 1_000, 1_000, 20), 0);
});

test('media sync does not seek an actively decoding video for small drift', () => {
  const playback = getTimelinePlaybackState(track('video'), baseClip, 7);
  const decision = getTimelineMediaSyncDecision(playback, 5.1, false, true);
  assert.equal(decision.shouldPlay, true);
  assert.equal(decision.shouldSeek, false);
});

test('media sync seeks a paused or badly drifted active clip', () => {
  const playback = getTimelinePlaybackState(track('video'), baseClip, 7);
  assert.equal(
    getTimelineMediaSyncDecision(playback, 0, true, true).shouldSeek,
    true,
  );
  assert.equal(
    getTimelineMediaSyncDecision(playback, 4, false, true).shouldSeek,
    true,
  );
});

test('2x playback maps project time to source time and halves clip span', () => {
  const fast = { ...baseClip, playbackRate: 2 };
  const state = getTimelinePlaybackState(track('video'), fast, 6);
  assert.equal(state.sourceTime, 6);
  assert.equal(state.inRange, true);
  assert.equal(
    getTimelinePlaybackState(track('video'), fast, 7.5).inRange,
    false,
  );
});

test('video queue appends clips after the current stack without overlap', () => {
  const existing = [
    { ...baseClip, startTime: 2, duration: 3, trimEnd: 0 },
    { ...baseClip, id: 'clip-2', startTime: 8, duration: 2, trimEnd: 0.5 },
  ];
  assert.deepEqual(
    getSequentialClipStartTimes(existing, [4, 1.5, 0]),
    [9.5, 13.5, 15],
  );
});

test('split preserves contiguous timeline and source-time alignment', () => {
  const split = splitTimelineClip(baseClip, 7, 'right');
  assert.ok(split);
  const [left, right] = split;
  assert.equal(left.startTime + left.duration, right.startTime);
  assert.equal(left.trimStart + left.duration, right.trimStart);
  assert.equal(
    left.duration + right.duration,
    baseClip.duration - baseClip.trimEnd,
  );
});

test('split rejects cuts too close to clip boundaries', () => {
  assert.equal(splitTimelineClip(baseClip, 4.01, 'right'), null);
  assert.equal(splitTimelineClip(baseClip, 10.99, 'right'), null);
});
