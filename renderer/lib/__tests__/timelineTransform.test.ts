import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTimelineAudioGraph,
  buildTimelineVideoGraph,
} from '../../../main/helpers/timelineFilterGraph.ts';
import type { TimelineTrack } from '../../../types/subtitleMerge.ts';

test('video export graph consumes normalized visual transform fields', () => {
  const track: TimelineTrack = {
    id: 'video',
    type: 'video',
    name: 'Video',
    order: 0,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips: [
      {
        id: 'clip',
        source: 'media://video',
        sourceFile: 'video.mp4',
        startTime: 1,
        duration: 4,
        trimStart: 0,
        trimEnd: 0,
        volume: 1,
        transform: {
          x: 0.2,
          y: -0.1,
          scaleX: 0.5,
          scaleY: 0.5,
          rotation: 15,
          mirrorX: false,
          flipY: false,
          opacity: 0.75,
        },
        inputIndex: 0,
      } as any,
    ],
  };
  const graph = buildTimelineVideoGraph([track], 5, 1920, 1080, 30);
  assert.match(graph, /scale=960:540/);
  assert.match(graph, /rotate=15\*PI\/180/);
  assert.match(graph, /colorchannelmixer=aa=0\.75/);
  assert.match(graph, /\+384:\(oh-ih\)\/2\+-108/);
});

test('video export graph applies a bounded blur mask to the composed output', () => {
  const track = {
    id: 'video',
    type: 'video' as const,
    name: 'Video',
    order: 0,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips: [],
  };
  const graph = buildTimelineVideoGraph([track], 5, 1920, 1080, 30, {
    enabled: true,
    xPercent: 10,
    yPercent: 20,
    widthPercent: 30,
    heightPercent: 25,
    strength: 12,
  });
  assert.match(graph, /crop=576:270:192:216/);
  assert.match(graph, /boxblur=luma_radius=12/);
});

test('audio export graph applies clip fade envelopes before mixing', () => {
  const graph = buildTimelineAudioGraph(
    [
      {
        id: 'audio',
        type: 'audio',
        name: 'Audio',
        order: 0,
        muted: false,
        hidden: false,
        locked: false,
        volume: 1,
        clips: [
          {
            id: 'clip',
            source: 'media://audio',
            sourceFile: 'audio.wav',
            startTime: 1,
            duration: 3,
            trimStart: 0,
            trimEnd: 0,
            volume: 1,
            fadeIn: 0.25,
            fadeOut: 0.4,
            inputIndex: 0,
            hasAudio: true,
          } as any,
        ],
      },
    ],
    5,
  );
  assert.match(graph, /afade=t=in:st=0:d=0\.25/);
  assert.match(graph, /afade=t=out:st=2\.6:d=0\.4/);
});
