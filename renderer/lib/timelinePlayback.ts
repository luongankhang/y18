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

export function getTimelineClipDuration(clip: TimelineClip): number {
  const rate = Math.max(0.0001, clip.playbackRate || 1);
  return Math.max(0, clip.duration - clip.trimEnd) / rate;
}

export function getTimelineClipEndTime(clip: TimelineClip): number {
  return clip.startTime + getTimelineClipDuration(clip);
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
  const effectiveDuration = getTimelineClipDuration(clip);
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
    sourceTime: Math.max(
      0,
      clip.trimStart +
        (currentTime - clip.startTime) * (clip.playbackRate || 1),
    ),
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
    // Keep the media clock close to the master clock without seeking every frame.
    // A 500 ms correction is audible for short SRT cues, so cap drift at 100 ms.
    shouldSeek:
      playback.inRange &&
      (mediaPaused || Math.abs(mediaCurrentTime - playback.sourceTime) > 0.1),
    sourceTime: playback.sourceTime,
  };
}
