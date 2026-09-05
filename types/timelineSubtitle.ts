import type {
  TimelineClip,
  TimelineProject,
  TimelineSubtitleCue,
  TimelineTrack,
} from './subtitleMerge';

export interface ActiveTimelineSubtitle {
  trackId: string;
  trackOrder: number;
  clipId: string;
  cueId: string;
  text: string;
  cueStartSec: number;
  cueEndSec: number;
  calculatedLocalTimeSec: number;
  linkedVideoClipId?: string;
}

export function parseSubtitleTimestampToSeconds(value: string): number {
  const match = value
    .trim()
    .match(/^(\d+):([0-5]\d):([0-5]\d)(?:[,.](\d{1,3}))?$/);
  if (!match) throw new Error(`SUBTITLE_TIMECODE_INVALID:${value}`);
  const fraction = (match[4] || '').padEnd(3, '0');
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(fraction || 0) / 1000
  );
}

export function formatSecondsToSubtitleTimestamp(value: number): string {
  const totalMs = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

export function getClipPlaybackRate(clip: TimelineClip): number {
  const rate = Number(clip.playbackRate ?? 1);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

export function mapSourceTimeToTimelineTime(
  sourceTimeSec: number,
  clip: Pick<TimelineClip, 'startTime' | 'trimStart' | 'playbackRate'>,
): number {
  const rate = getClipPlaybackRate(clip as TimelineClip);
  return clip.startTime + (sourceTimeSec - clip.trimStart) / rate;
}

export function mapTimelineTimeToSourceTime(
  projectTimeSec: number,
  clip: Pick<TimelineClip, 'startTime' | 'trimStart' | 'playbackRate'>,
): number {
  const rate = getClipPlaybackRate(clip as TimelineClip);
  return clip.trimStart + (projectTimeSec - clip.startTime) * rate;
}

function findLinkedVideoClip(
  clip: TimelineClip,
  tracks: TimelineTrack[],
): TimelineClip | undefined {
  if (clip.subtitleTimingMode !== 'linked-video' || !clip.linkedVideoClipId)
    return undefined;
  return tracks
    .filter((track) => track.type === 'video')
    .flatMap((track) => track.clips)
    .find((candidate) => candidate.id === clip.linkedVideoClipId);
}

function mapCue(
  cue: TimelineSubtitleCue,
  subtitleClip: TimelineClip,
  tracks: TimelineTrack[],
): { start: number; end: number; localTimeClip: TimelineClip } | null {
  const timingClip = findLinkedVideoClip(subtitleClip, tracks) || subtitleClip;
  const sourceEnd = Math.max(
    timingClip.trimStart,
    timingClip.trimStart + timingClip.duration - timingClip.trimEnd,
  );
  if (
    cue.sourceEndSec <= timingClip.trimStart ||
    cue.sourceStartSec >= sourceEnd
  )
    return null;
  const clippedStart = Math.max(cue.sourceStartSec, timingClip.trimStart);
  const clippedEnd = Math.min(cue.sourceEndSec, sourceEnd);
  const start = mapSourceTimeToTimelineTime(clippedStart, timingClip);
  const end = mapSourceTimeToTimelineTime(clippedEnd, timingClip);
  return end > start ? { start, end, localTimeClip: timingClip } : null;
}

export function getProjectSubtitleCues(
  project: Pick<TimelineProject, 'duration' | 'tracks'>,
): ActiveTimelineSubtitle[] {
  const output: ActiveTimelineSubtitle[] = [];
  for (const track of project.tracks
    .filter((candidate) => candidate.type === 'subtitle' && !candidate.hidden)
    .sort((a, b) => a.order - b.order)) {
    for (const clip of track.clips) {
      for (const cue of clip.subtitleCues || []) {
        const mapped = mapCue(cue, clip, project.tracks);
        if (!mapped || mapped.end <= 0 || mapped.start >= project.duration)
          continue;
        output.push({
          trackId: track.id,
          trackOrder: track.order,
          clipId: clip.id,
          cueId: cue.id,
          text: cue.text,
          cueStartSec: Math.max(0, mapped.start),
          cueEndSec: Math.min(project.duration, mapped.end),
          calculatedLocalTimeSec: 0,
          linkedVideoClipId: clip.linkedVideoClipId,
        });
      }
    }
  }
  return output.sort(
    (a, b) => a.trackOrder - b.trackOrder || a.cueStartSec - b.cueStartSec,
  );
}

export function getActiveSubtitleCues(
  projectCurrentTimeSec: number,
  subtitleTracks: TimelineTrack[],
  projectDuration = Number.MAX_SAFE_INTEGER,
): ActiveTimelineSubtitle[] {
  return getProjectSubtitleCues({
    duration: projectDuration,
    tracks: subtitleTracks,
  })
    .filter(
      (cue) =>
        cue.cueStartSec <= projectCurrentTimeSec &&
        projectCurrentTimeSec < cue.cueEndSec,
    )
    .map((cue) => {
      const subtitleClip = subtitleTracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === cue.clipId)!;
      const localClip =
        findLinkedVideoClip(subtitleClip, subtitleTracks) || subtitleClip;
      return {
        ...cue,
        calculatedLocalTimeSec: mapTimelineTimeToSourceTime(
          projectCurrentTimeSec,
          localClip,
        ),
      };
    });
}

export function serializeProjectSubtitleSrt(
  project: Pick<TimelineProject, 'duration' | 'tracks'>,
): string {
  return getProjectSubtitleCues(project)
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSecondsToSubtitleTimestamp(cue.cueStartSec)} --> ${formatSecondsToSubtitleTimestamp(cue.cueEndSec)}\n${cue.text}\n`,
    )
    .join('\n');
}
