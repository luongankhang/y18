import type { TimelineClip, TimelineTrack } from '../../types/subtitleMerge';

export type IndexedTimelineClip = TimelineClip & {
  inputIndex: number;
  hasAudio?: boolean;
};

export function getEffectiveClipDuration(clip: TimelineClip): number {
  return (
    Math.max(0.001, clip.duration - clip.trimEnd) /
    Math.max(0.0001, clip.playbackRate || 1)
  );
}

export function buildTimelineVideoGraph(
  videoTracks: TimelineTrack[],
  duration: number,
  width: number,
  height: number,
  fps: number,
): string {
  const graph = [
    `color=c=black:s=${width}x${height}:r=${fps}:d=${duration}[base]`,
  ];
  let current = 'base';
  let layer = 0;

  // Lower rows are composed first so the top row is the final overlay.
  for (const track of [...videoTracks].sort((a, b) => b.order - a.order)) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      const inputIndex = (clip as IndexedTimelineClip).inputIndex;
      const timelineDuration = getEffectiveClipDuration(clip);
      const playbackRate = Math.max(0.5, Math.min(2, clip.playbackRate || 1));
      const next = `v${layer++}`;
      const clipLabel = `clip${layer}`;
      const end = Math.min(duration, clip.startTime + timelineDuration);
      const sourceDuration = Math.max(
        0.001,
        (end - clip.startTime) * playbackRate,
      );
      const visualFilters = [
        clip.mirrorX ? 'hflip' : '',
        clip.flipY ? 'vflip' : '',
      ].filter(Boolean);
      const transform = visualFilters.length
        ? `,${visualFilters.join(',')}`
        : '';
      graph.push(
        `[${inputIndex}:v]trim=start=${Math.max(0, clip.trimStart)}:duration=${sourceDuration},setpts=(PTS-STARTPTS)/${playbackRate}+${Math.max(0, clip.startTime)}/TB${transform},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[${clipLabel}]`,
      );
      graph.push(
        `[${current}][${clipLabel}]overlay=shortest=0:eof_action=pass:format=auto[${next}]`,
      );
      current = next;
    }
  }
  graph.push(`[${current}]format=yuv420p[outv]`);
  return graph.join(';');
}

export function buildTimelineAudioGraph(
  mediaTracks: TimelineTrack[],
  duration: number,
): string {
  const parts: string[] = [];
  let count = 0;

  for (const track of mediaTracks) {
    if (track.muted || track.type === 'subtitle') continue;
    for (const clip of track.clips) {
      const audioClip = clip as IndexedTimelineClip;
      if (!audioClip.hasAudio) continue;
      const label = `a${count++}`;
      const effectiveDuration = getEffectiveClipDuration(clip);
      const playbackRate = Math.max(0.5, Math.min(2, clip.playbackRate || 1));
      const end = Math.min(duration, clip.startTime + effectiveDuration);
      const sourceDuration = Math.max(
        0.001,
        (end - clip.startTime) * playbackRate,
      );
      const delay = Math.round(Math.max(0, clip.startTime) * 1000);
      parts.push(
        `[${audioClip.inputIndex}:a]atrim=start=${Math.max(0, clip.trimStart)}:duration=${sourceDuration},asetpts=PTS-STARTPTS,atempo=${playbackRate},adelay=${delay}|${delay},volume=${Math.max(0, track.volume * clip.volume)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[${label}]`,
      );
    }
  }

  if (!count) {
    return `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[outa]`;
  }
  parts.push(
    `[${Array.from({ length: count }, (_, i) => `a${i}`).join('][')}]amix=inputs=${count}:duration=longest:dropout_transition=0,atrim=duration=${duration},aresample=48000[outa]`,
  );
  return parts.join(';');
}
