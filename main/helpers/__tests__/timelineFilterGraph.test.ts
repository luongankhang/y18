import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  TimelineClip,
  TimelineTrack,
} from '../../../types/subtitleMerge.ts';
import {
  buildTimelineAudioGraph,
  buildTimelineVideoGraph,
  type IndexedTimelineClip,
} from '../timelineFilterGraph.ts';

function clip(
  inputIndex: number,
  overrides: Partial<TimelineClip> = {},
): IndexedTimelineClip {
  return {
    id: `clip-${inputIndex}`,
    source: `media://${inputIndex}`,
    sourceFile: `source-${inputIndex}.mp4`,
    startTime: 0,
    duration: 10,
    trimStart: 0,
    trimEnd: 0,
    volume: 1,
    inputIndex,
    hasAudio: true,
    ...overrides,
  };
}

function track(
  type: TimelineTrack['type'],
  order: number,
  clips: IndexedTimelineClip[],
  overrides: Partial<TimelineTrack> = {},
): TimelineTrack {
  return {
    id: `${type}-${order}`,
    type,
    name: `${type} ${order}`,
    order,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips,
    ...overrides,
  };
}

test('mixes embedded video audio with external audio', () => {
  const graph = buildTimelineAudioGraph(
    [
      track('video', 0, [clip(0)], { volume: 0.8 }),
      track('audio', 1, [clip(1, { volume: 0.5 })]),
    ],
    10,
  );
  assert.match(graph, /\[0:a\].*volume=0\.8/);
  assert.match(graph, /\[1:a\].*volume=0\.5/);
  assert.match(graph, /amix=inputs=2/);
});

test('excludes muted media tracks and retains unmuted sources', () => {
  const graph = buildTimelineAudioGraph(
    [
      track('video', 0, [clip(0)], { muted: true }),
      track('audio', 1, [clip(1)]),
    ],
    10,
  );
  assert.doesNotMatch(graph, /\[0:a\]/);
  assert.match(graph, /\[1:a\]/);
  assert.match(graph, /amix=inputs=1/);
});

test('keeps audio from a hidden but unmuted video track', () => {
  const graph = buildTimelineAudioGraph(
    [track('video', 0, [clip(0)], { hidden: true })],
    10,
  );
  assert.match(graph, /\[0:a\]/);
});

test('uses silence when no input has a decodable audio stream', () => {
  const noAudio = clip(0);
  noAudio.hasAudio = false;
  assert.equal(
    buildTimelineAudioGraph([track('video', 0, [noAudio])], 12),
    'anullsrc=r=48000:cl=stereo,atrim=duration=12[outa]',
  );
});

test('applies clip trim and timeline delay without exceeding project duration', () => {
  const graph = buildTimelineAudioGraph(
    [
      track('audio', 0, [
        clip(2, { startTime: 3, duration: 9, trimStart: 1.5, trimEnd: 2 }),
      ]),
    ],
    8,
  );
  assert.match(graph, /atrim=start=1\.5:duration=5/);
  assert.match(graph, /adelay=3000\|3000/);
  assert.match(graph, /atrim=duration=8/);
});

test('composes the top timeline row after lower video rows', () => {
  const graph = buildTimelineVideoGraph(
    [track('video', 0, [clip(0)]), track('video', 1, [clip(1)])],
    10,
    1280,
    720,
    30,
  );
  assert.ok(graph.indexOf('[1:v]') < graph.indexOf('[0:v]'));
  assert.match(graph, /\[v0\]\[clip2\]overlay/);
});

test('omits hidden video tracks from the visual graph', () => {
  const graph = buildTimelineVideoGraph(
    [track('video', 0, [clip(0)], { hidden: true })],
    5,
    640,
    360,
    24,
  );
  assert.doesNotMatch(graph, /\[0:v\]/);
  assert.match(graph, /\[base\]format=yuv420p\[outv\]/);
});

test('applies clip-local mirror and flip filters before overlay', () => {
  const graph = buildTimelineVideoGraph(
    [track('video', 0, [clip(0, { mirrorX: true, flipY: true })])],
    10,
    1280,
    720,
    30,
  );
  assert.match(graph, /trim=.*hflip,vflip,scale=/);
  assert.doesNotMatch(graph, /\[0:a\].*hflip|\[0:a\].*vflip/);
});

test('applies the same playback rate to video frames and embedded audio', () => {
  const fast = clip(0, { playbackRate: 2, duration: 8 });
  const videoGraph = buildTimelineVideoGraph(
    [track('video', 0, [fast])],
    8,
    640,
    360,
    24,
  );
  const audioGraph = buildTimelineAudioGraph([track('video', 0, [fast])], 8);
  assert.match(videoGraph, /setpts=\(PTS-STARTPTS\)\/2/);
  assert.match(audioGraph, /atempo=2/);
});
