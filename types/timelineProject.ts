import {
  TIMELINE_SCHEMA_VERSION,
  type TimelineAsset,
  type TimelineClip,
  type TimelineProject,
  type TimelineTrack,
  type TimelineTrackType,
  type TimelineTransform,
} from './subtitleMerge.ts';

const DEFAULT_TRANSFORM: TimelineTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  mirrorX: false,
  flipY: false,
  opacity: 1,
};

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function inferAssetKind(trackType: TimelineTrackType): TimelineAsset['kind'] {
  return trackType;
}

function normalizeTransform(clip: TimelineClip): TimelineTransform {
  return {
    ...DEFAULT_TRANSFORM,
    ...(clip.transform || {}),
    mirrorX: Boolean(clip.transform?.mirrorX ?? clip.mirrorX),
    flipY: Boolean(clip.transform?.flipY ?? clip.flipY),
    opacity: Math.max(0, Math.min(1, safeNumber(clip.transform?.opacity, 1))),
  };
}

function normalizeClip(
  clip: TimelineClip,
  track: TimelineTrack,
  assets: Record<string, TimelineAsset>,
): TimelineClip {
  const assetId =
    clip.assetId ||
    `asset-${encodeURIComponent(clip.sourceFile || clip.source)}`;
  const type = clip.type || track.type;
  if (!assets[assetId]) {
    assets[assetId] = {
      id: assetId,
      sourceFile: clip.sourceFile,
      kind: inferAssetKind(type),
      probeStatus: 'unknown',
    };
  }
  return {
    ...clip,
    assetId,
    trackId: clip.trackId || track.id,
    type,
    transform: normalizeTransform(clip),
    effects: Array.isArray(clip.effects) ? clip.effects : [],
  };
}

/**
 * Migrates old localStorage projects into the versioned multi-track shape.
 * The function is pure so it can be tested without React or Electron.
 */
export function normalizeTimelineProject(
  input: TimelineProject,
  fallbackDuration = 1,
): TimelineProject {
  const assets: Record<string, TimelineAsset> = {
    ...(input.assets || {}),
  };
  const duration = Math.max(
    1,
    safeNumber(input.duration, safeNumber(fallbackDuration, 1)),
  );
  const tracks = (input.tracks || []).map((track) => ({
    ...track,
    clips: track.clips.map((clip) => normalizeClip(clip, track, assets)),
  }));
  return {
    ...input,
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    duration,
    currentTime: Math.max(
      0,
      Math.min(duration, safeNumber(input.currentTime, 0)),
    ),
    tracks,
    assets,
  };
}
