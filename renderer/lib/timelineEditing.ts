import type { TimelineClip } from '../../types/subtitleMerge';
import { getTimelineClipDuration } from './timelinePlayback.ts';

const MIN_CLIP_DURATION = 0.05;

export function splitTimelineClip(
  clip: TimelineClip,
  splitTime: number,
  rightClipId: string,
): [TimelineClip, TimelineClip] | null {
  const effectiveDuration = getTimelineClipDuration(clip);
  const offset = splitTime - clip.startTime;
  if (
    offset <= MIN_CLIP_DURATION ||
    offset >= effectiveDuration - MIN_CLIP_DURATION
  )
    return null;
  const rate = clip.playbackRate || 1;
  const sourceOffset = offset * rate;
  return [
    { ...clip, duration: sourceOffset, trimEnd: 0 },
    {
      ...clip,
      id: rightClipId,
      startTime: splitTime,
      duration: (effectiveDuration - offset) * rate,
      trimStart: clip.trimStart + sourceOffset,
      trimEnd: 0,
    },
  ];
}
