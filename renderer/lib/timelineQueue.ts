import type { TimelineClip } from '../../types/subtitleMerge';

const MIN_CLIP_DURATION = 0.05;

export function getSequentialClipStartTimes(
  existingClips: TimelineClip[],
  durations: number[],
): number[] {
  let cursor = existingClips.reduce(
    (end, clip) =>
      Math.max(end, clip.startTime + Math.max(0, clip.duration - clip.trimEnd)),
    0,
  );
  return durations.map((duration) => {
    const start = cursor;
    cursor += Math.max(MIN_CLIP_DURATION, duration || MIN_CLIP_DURATION);
    return start;
  });
}
