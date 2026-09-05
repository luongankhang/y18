import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTimedTtsClipInputs } from '../timelineTts.ts';

test('TTS outputs stay anchored to SRT cue start times instead of queue order', () => {
  const clips = buildTimedTtsClipInputs(
    [
      { id: 'cue-0', text: 'Một', start: 4.25, end: 5.5 },
      { id: 'cue-1', text: 'Hai', start: 1, end: 2.75 },
    ],
    [
      { itemId: 'cue-0', outputPath: 'voice-0.wav', duration: 2 },
      { itemId: 'cue-1', outputPath: 'voice-1.wav', duration: 0.5 },
    ],
    { generator: 'omnivoice', modelId: 'k2-fsa/OmniVoice' },
  );
  assert.deepEqual(
    clips.map((clip) => [clip.sourceFile, clip.startTime, clip.duration]),
    [
      ['voice-0.wav', 4.25, 1.25],
      ['voice-1.wav', 1, 0.5],
    ],
  );
  assert.equal(clips[0].metadata?.subtitleStartTime, 4.25);
  assert.equal(clips[1].metadata?.subtitleEndTime, 2.75);
});

test('TTS output cannot be scheduled with invalid or negative cue timing', () => {
  const clips = buildTimedTtsClipInputs(
    [
      { id: 'bad', text: 'bad', start: -2, end: -1 },
      { id: 'empty', text: 'empty', start: 3, end: 3 },
    ],
    [{ itemId: 'bad', outputPath: 'bad.wav', duration: 1 }],
    { generator: 'omnivoice' },
  );
  assert.deepEqual(clips, []);
});
