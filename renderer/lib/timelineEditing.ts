import type { TimelineClip } from '../../types/subtitleMerge';

const MIN_CLIP_DURATION = 0.05;

export function splitTimelineClip(
  clip: TimelineClip,
  splitTime: number,
  rightClipId: string,
): [TimelineClip, TimelineClip] | null {
  const effectiveDuration = clip.duration - clip.trimEnd;
  const offset = splitTime - clip.startTime;
  if (
    offset <= MIN_CLIP_DURATION ||
    offset >= effectiveDuration - MIN_CLIP_DURATION
  )
    return null;
  return [
    { ...clip, duration: offset, trimEnd: 0 },
    {
      ...clip,
      id: rightClipId,
      startTime: splitTime,
      duration: effectiveDuration - offset,
      trimStart: clip.trimStart + offset,
      trimEnd: 0,
    },
  ];
}
