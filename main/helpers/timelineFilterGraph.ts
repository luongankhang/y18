import type {
  SubtitleBlurMask,
  TimelineClip,
  TimelineTrack,
} from '../../types/subtitleMerge';

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
  blurMask?: SubtitleBlurMask,
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
        clip.mirrorX || clip.transform?.mirrorX ? 'hflip' : '',
        clip.flipY || clip.transform?.flipY ? 'vflip' : '',
      ].filter(Boolean);
      const transform = visualFilters.length
        ? `,${visualFilters.join(',')}`
        : '';
      const clipTransform = clip.transform || {
        x: 0,
        y: 0,
        scaleX: clip.mirrorX ? -1 : 1,
        scaleY: clip.flipY ? -1 : 1,
        rotation: 0,
        opacity: 1,
      };
      const scaleX = Math.max(0.05, Math.abs(clipTransform.scaleX || 1));
      const scaleY = Math.max(0.05, Math.abs(clipTransform.scaleY || 1));
      const opacity = Math.max(0, Math.min(1, clipTransform.opacity ?? 1));
      const positionX = Number(clipTransform.x || 0) * width;
      const positionY = Number(clipTransform.y || 0) * height;
      const rotation = Number(clipTransform.rotation || 0);
      graph.push(
        `[${inputIndex}:v]trim=start=${Math.max(0, clip.trimStart)}:duration=${sourceDuration},setpts=(PTS-STARTPTS)/${playbackRate}+${Math.max(0, clip.startTime)}/TB${transform},scale=${width * scaleX}:${height * scaleY}:force_original_aspect_ratio=decrease,pad=${width * scaleX}:${height * scaleY}:(ow-iw)/2:(oh-ih)/2:color=black@0,rotate=${rotation}*PI/180:fillcolor=black@0,colorchannelmixer=aa=${opacity},pad=${width}:${height}:(ow-iw)/2+${positionX}:(oh-ih)/2+${positionY}:color=black@0[${clipLabel}]`,
      );
      graph.push(
        `[${current}][${clipLabel}]overlay=shortest=0:eof_action=pass:format=auto[${next}]`,
      );
      current = next;
    }
  }
  if (blurMask?.enabled) {
    const x = Math.round((width * blurMask.xPercent) / 100);
    const y = Math.round((height * blurMask.yPercent) / 100);
    const w = Math.max(2, Math.round((width * blurMask.widthPercent) / 100));
    const h = Math.max(2, Math.round((height * blurMask.heightPercent) / 100));
    const strength = Math.max(1, Math.round(blurMask.strength));
    graph.push(
      `[${current}]split=2[clean][blur-source];[blur-source]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${strength}:luma_power=1[blurred];[clean][blurred]overlay=${x}:${y}:format=auto[blurred-out]`,
    );
    current = 'blurred-out';
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
