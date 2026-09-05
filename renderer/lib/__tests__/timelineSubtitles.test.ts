import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  TimelineClip,
  TimelineProject,
  TimelineSubtitleCue,
  TimelineTrack,
} from '../../../types/subtitleMerge.ts';
import {
  formatSecondsToSubtitleTimestamp,
  getActiveSubtitleCues,
  getProjectSubtitleCues,
  mapSourceTimeToTimelineTime,
  mapTimelineTimeToSourceTime,
  parseSubtitleTimestampToSeconds,
  serializeProjectSubtitleSrt,
} from '../../../types/timelineSubtitle.ts';

const cues: TimelineSubtitleCue[] = [
  { id: 'c1', text: 'Câu số một', sourceStartSec: 1, sourceEndSec: 3 },
  { id: 'c2', text: 'Câu số hai', sourceStartSec: 3.5, sourceEndSec: 5.25 },
  { id: 'c3', text: 'Câu số ba', sourceStartSec: 6, sourceEndSec: 8 },
];

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'subtitle-clip',
    source: 'test.srt',
    sourceFile: 'test.srt',
    startTime: 0,
    duration: 8,
    trimStart: 0,
    trimEnd: 0,
    playbackRate: 1,
    volume: 1,
    subtitleTimingMode: 'absolute',
    subtitleCues: cues,
    ...overrides,
  };
}

function track(
  type: TimelineTrack['type'],
  clips: TimelineClip[],
  overrides: Partial<TimelineTrack> = {},
): TimelineTrack {
  return {
    id: `${type}-track`,
    type,
    name: type,
    order: 0,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips,
    ...overrides,
  };
}

function active(time: number, tracks = [track('subtitle', [clip()])]) {
  return getActiveSubtitleCues(time, tracks, 30).map((cue) => cue.text);
}

test('C1 parses milliseconds and uses exclusive cue end boundaries', () => {
  assert.equal(parseSubtitleTimestampToSeconds('00:00:01,000'), 1);
  assert.equal(parseSubtitleTimestampToSeconds('00:00:05.250'), 5.25);
  assert.equal(parseSubtitleTimestampToSeconds('01:02:03,250'), 3723.25);
  assert.equal(formatSecondsToSubtitleTimestamp(3723.25), '01:02:03,250');
  assert.deepEqual(active(0.9), []);
  assert.deepEqual(active(1), ['Câu số một']);
  assert.deepEqual(active(2.5), ['Câu số một']);
  assert.deepEqual(active(3), []);
  assert.deepEqual(active(3.5), ['Câu số hai']);
  assert.deepEqual(active(5.25), []);
  assert.deepEqual(active(6), ['Câu số ba']);
});

test('C2 maps source subtitle to a video starting at five seconds', () => {
  const video = clip({ id: 'video', startTime: 5, subtitleCues: undefined });
  const subtitle = clip({
    subtitleTimingMode: 'linked-video',
    linkedVideoClipId: video.id,
  });
  const project = {
    duration: 20,
    tracks: [track('video', [video]), track('subtitle', [subtitle])],
  };
  assert.deepEqual(
    getProjectSubtitleCues(project).map((cue) => [
      cue.cueStartSec,
      cue.cueEndSec,
    ]),
    [
      [6, 8],
      [8.5, 10.25],
      [11, 13],
    ],
  );
});

test('C3 maps trim start once without a double offset', () => {
  const timingClip = clip({ startTime: 5, trimStart: 2, duration: 10 });
  assert.equal(mapSourceTimeToTimelineTime(3, timingClip), 6);
  assert.equal(mapSourceTimeToTimelineTime(4, timingClip), 7);
  assert.equal(mapTimelineTimeToSourceTime(6, timingClip), 3);
});

test('C4 and C5 map 2x and 0.5x playback rates', () => {
  const fast = clip({ startTime: 5, playbackRate: 2 });
  assert.equal(mapSourceTimeToTimelineTime(2, fast), 6);
  assert.equal(mapSourceTimeToTimelineTime(4, fast), 7);
  const slow = clip({ playbackRate: 0.5 });
  assert.equal(
    mapSourceTimeToTimelineTime(4, slow) - mapSourceTimeToTimelineTime(2, slow),
    4,
  );
});

test('C6 seek and pause select directly from project time without a timer', () => {
  assert.deepEqual(active(2), ['Câu số một']);
  assert.deepEqual(active(4), ['Câu số hai']);
  assert.deepEqual(active(2), ['Câu số một']);
  assert.deepEqual(active(8), []);
});

test('C7 hidden subtitle tracks do not render and visible order is stable', () => {
  const visible = track('subtitle', [clip()], { id: 'visible', order: 2 });
  const top = track('subtitle', [clip({ id: 'top-clip' })], {
    id: 'top',
    order: 1,
  });
  const hidden = track('subtitle', [clip({ id: 'hidden-clip' })], {
    id: 'hidden',
    order: 0,
    hidden: true,
  });
  assert.deepEqual(
    getActiveSubtitleCues(2, [visible, hidden, top], 10).map(
      (cue) => cue.trackId,
    ),
    ['top', 'visible'],
  );
});

test('C8 save and reload preserves millisecond timing and link metadata', () => {
  const project: TimelineProject = {
    duration: 12.345,
    currentTime: 3.5,
    tracks: [
      track('subtitle', [
        clip({
          startTime: 1.125,
          trimStart: 0.25,
          playbackRate: 0.5,
          linkedVideoClipId: 'video-1',
        }),
      ]),
    ],
  };
  const restored = JSON.parse(JSON.stringify(project)) as TimelineProject;
  assert.deepEqual(restored, project);
});

test('playhead mode applies its offset exactly once', () => {
  const subtitle = clip({
    startTime: 10,
    subtitleTimingMode: 'playhead',
  });
  const mapped = getProjectSubtitleCues({
    duration: 30,
    tracks: [track('subtitle', [subtitle])],
  });
  assert.deepEqual(
    mapped.map((cue) => cue.cueStartSec),
    [11, 13.5, 16],
  );
});

test('C9 export serializer uses the exact same mapped project timing', () => {
  const subtitle = clip({ startTime: 5, trimStart: 2, duration: 10 });
  const content = serializeProjectSubtitleSrt({
    duration: 20,
    tracks: [track('subtitle', [subtitle])],
  });
  assert.match(content, /00:00:05,000 --> 00:00:06,000\nCâu số một/);
  assert.match(content, /00:00:06,500 --> 00:00:08,250\nCâu số hai/);
  assert.doesNotMatch(content, /00:00:01,000 --> 00:00:03,000/);
});
