import type { TimelineClip } from '../../types/subtitleMerge';
import { getTimelineClipDuration } from './timelinePlayback.ts';

const MIN_CLIP_DURATION = 0.05;

export type TimelineTrimEdge = 'start' | 'end';

export function trimTimelineClip(
  clip: TimelineClip,
  edge: TimelineTrimEdge,
  deltaTimelineSec: number,
): TimelineClip {
  const rate = Math.max(0.5, Math.min(2, clip.playbackRate || 1));
  const effectiveDuration = getTimelineClipDuration(clip);
  const delta = Number.isFinite(deltaTimelineSec) ? deltaTimelineSec : 0;
  const maxDelta = Math.max(0, effectiveDuration - MIN_CLIP_DURATION);

  if (edge === 'start') {
    const applied = Math.max(-clip.startTime, Math.min(maxDelta, delta));
    const sourceDelta = applied * rate;
    return {
      ...clip,
      startTime: Math.max(0, clip.startTime + applied),
      duration: Math.max(MIN_CLIP_DURATION, clip.duration - sourceDelta),
      trimStart: Math.max(0, clip.trimStart + sourceDelta),
    };
  }

  const sourceDelta = delta * rate;
  const nextTrimEnd = Math.max(
    0,
    Math.min(
      Math.max(0, clip.duration - clip.trimStart - MIN_CLIP_DURATION * rate),
      clip.trimEnd + sourceDelta,
    ),
  );
  return { ...clip, trimEnd: nextTrimEnd };
}

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
