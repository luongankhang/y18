import type { TimelineClip, TimelineTrack } from '../../types/subtitleMerge';

export interface TimelinePlaybackState {
  inRange: boolean;
  visible: boolean;
  shouldRun: boolean;
  muted: boolean;
  volume: number;
  sourceTime: number;
}

export interface TimelineMediaSyncDecision {
  visible: boolean;
  shouldPlay: boolean;
  shouldSeek: boolean;
  sourceTime: number;
}

export function getTimelineClockTime(
  startedTime: number,
  startedAtMs: number,
  nowMs: number,
  duration: number,
): number {
  const elapsed = Math.max(0, nowMs - startedAtMs) / 1000;
  return Math.min(Math.max(0, duration), Math.max(0, startedTime + elapsed));
}

export function getTimelinePlaybackState(
  track: TimelineTrack,
  clip: TimelineClip,
  currentTime: number,
): TimelinePlaybackState {
  const effectiveDuration = Math.max(0, clip.duration - clip.trimEnd);
  const inRange =
    currentTime >= clip.startTime &&
    currentTime < clip.startTime + effectiveDuration;
  const visible = track.type === 'video' && inRange && !track.hidden;
  const muted = track.muted || track.volume <= 0 || clip.volume <= 0;
  const shouldRun =
    inRange &&
    track.type !== 'subtitle' &&
    (track.type === 'video' ? visible || !muted : !muted);

  return {
    inRange,
    visible,
    shouldRun,
    muted,
    volume: Math.max(0, Math.min(1, track.volume * clip.volume)),
    sourceTime: Math.max(0, clip.trimStart + currentTime - clip.startTime),
  };
}

export function getTimelineMediaSyncDecision(
  playback: TimelinePlaybackState,
  mediaCurrentTime: number,
  mediaPaused: boolean,
  isPlaying: boolean,
): TimelineMediaSyncDecision {
  return {
    visible: playback.visible,
    shouldPlay: isPlaying && playback.shouldRun,
    // Avoid seeking on every animation frame; repeated seeks can blank a decoder.
    shouldSeek:
      playback.inRange &&
      (mediaPaused || Math.abs(mediaCurrentTime - playback.sourceTime) > 0.5),
    sourceTime: playback.sourceTime,
  };
}
