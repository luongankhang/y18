import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineProject } from '../../../types/subtitleMerge.ts';
import { normalizeTimelineProject } from '../../../types/timelineProject.ts';

test('migrates a legacy project into a versioned asset and transform model', () => {
  const legacy: TimelineProject = {
    duration: 12,
    currentTime: 20,
    tracks: [
      {
        id: 'video-1',
        type: 'video',
        name: 'Video',
        order: 0,
        muted: false,
        hidden: false,
        locked: false,
        volume: 1,
        clips: [
          {
            id: 'clip-1',
            source: 'media://video',
            sourceFile: 'video.mp4',
            startTime: 0,
            duration: 12,
            trimStart: 0,
            trimEnd: 0,
            volume: 1,
            mirrorX: true,
          },
        ],
      },
    ],
  };
  const migrated = normalizeTimelineProject(legacy);
  const clip = migrated.tracks[0].clips[0];
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.currentTime, 12);
  assert.equal(clip.trackId, 'video-1');
  assert.equal(clip.type, 'video');
  assert.equal(clip.transform?.mirrorX, true);
  assert.equal(clip.transform?.opacity, 1);
  assert.equal(clip.assetId, 'asset-video.mp4');
  assert.equal(migrated.assets?.[clip.assetId!].sourceFile, 'video.mp4');
});

test('migration is deterministic and preserves existing asset metadata', () => {
  const project: TimelineProject = {
    schemaVersion: 1,
    duration: 4,
    currentTime: 1,
    assets: {
      'asset-a': {
        id: 'asset-a',
        sourceFile: 'voice.wav',
        kind: 'audio',
        probeStatus: 'ready',
      },
    },
    tracks: [
      {
        id: 'audio-1',
        type: 'audio',
        name: 'Audio',
        order: 0,
        muted: false,
        hidden: false,
        locked: false,
        volume: 1,
        clips: [
          {
            id: 'voice-1',
            assetId: 'asset-a',
            source: 'media://voice',
            sourceFile: 'voice.wav',
            startTime: 0,
            duration: 4,
            trimStart: 0,
            trimEnd: 0,
            volume: 1,
          },
        ],
      },
    ],
  };
  const first = normalizeTimelineProject(project);
  const second = normalizeTimelineProject(first);
  assert.deepEqual(second, first);
  assert.equal(second.assets?.['asset-a'].probeStatus, 'ready');
});
