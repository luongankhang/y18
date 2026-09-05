import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TimelineClip,
  TimelineProject,
  TimelineTrack,
  TimelineTrackType,
} from '../../../../types/subtitleMerge';
import { getSequentialClipStartTimes } from '../../../lib/timelineQueue';
import { splitTimelineClip } from '../../../lib/timelineEditing';
import { normalizeTimelineProject } from '../../../../types/timelineProject';

const MIN_CLIP_DURATION = 0.05;

function makeTrack(type: TimelineTrackType, order: number): TimelineTrack {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    name: `${type[0].toUpperCase()}${type.slice(1)} ${order + 1}`,
    order,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips: [],
  };
}

function clampClip(clip: TimelineClip, duration: number): TimelineClip {
  const maxStart = Math.max(0, duration - MIN_CLIP_DURATION);
  const startTime = Math.min(maxStart, Math.max(0, clip.startTime));
  const playbackRate = Math.max(0.5, Math.min(2, clip.playbackRate || 1));
  const maxDuration = Math.max(
    MIN_CLIP_DURATION,
    (duration - startTime) * playbackRate,
  );
  const clipDuration = Math.min(
    maxDuration,
    Math.max(MIN_CLIP_DURATION, clip.duration),
  );
  const minimumSourceSpan = MIN_CLIP_DURATION * playbackRate;
  const trimStart = Math.max(0, clip.trimStart);
  const trimEnd = Math.min(
    Math.max(0, clip.trimEnd),
    Math.max(0, clipDuration - minimumSourceSpan),
  );
  return {
    ...clip,
    startTime,
    duration: clipDuration,
    trimStart,
    trimEnd,
    playbackRate,
    volume: Math.max(0, Math.min(2, clip.volume)),
    mirrorX: Boolean(clip.mirrorX),
    flipY: Boolean(clip.flipY),
  };
}

export function useTimelineEditor(
  videoPath: string | null,
  subtitlePath: string | null,
  initialDuration: number,
  initialProject?: TimelineProject | null,
) {
  const [project, setProject] = useState<TimelineProject>(() =>
    initialProject
      ? (() => {
          const migrated = normalizeTimelineProject(
            initialProject,
            initialDuration,
          );
          return {
            ...migrated,
            tracks: migrated.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((clip) =>
                clampClip(clip, migrated.duration),
              ),
            })),
          };
        })()
      : {
          duration: Math.max(1, initialDuration || 1),
          currentTime: 0,
          tracks: [
            makeTrack('video', 0),
            makeTrack('audio', 1),
            makeTrack('subtitle', 2),
          ],
        },
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const undoStackRef = useRef<TimelineProject[]>([]);
  const redoStackRef = useRef<TimelineProject[]>([]);

  useEffect(() => {
    setProject((prev) => {
      const duration = Math.max(1, initialDuration || prev.duration || 1);
      const tracks = prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clampClip(clip, duration)),
      }));
      if (
        videoPath &&
        !tracks.some(
          (track) =>
            track.type === 'video' &&
            track.clips.some((clip) => clip.sourceFile === videoPath),
        )
      ) {
        const track = tracks.find((item) => item.type === 'video') || tracks[0];
        const clip: TimelineClip = {
          id: `clip-${Date.now()}`,
          source: `media://${encodeURIComponent(videoPath)}`,
          sourceFile: videoPath,
          startTime: 0,
          duration: Math.min(duration, initialDuration || duration),
          trimStart: 0,
          trimEnd: 0,
          playbackRate: 1,
          volume: 1,
          mirrorX: false,
          flipY: false,
        };
        track.clips = [...track.clips, clampClip(clip, duration)];
      } else if (videoPath) {
        // The first render can happen before ffprobe returns the real duration.
        // Expand only the untouched auto-created clip, never user-edited clips.
        tracks.forEach((track) => {
          if (track.type !== 'video') return;
          track.clips = track.clips.map((clip) =>
            clip.sourceFile === videoPath &&
            clip.startTime === 0 &&
            clip.trimStart === 0 &&
            clip.trimEnd === 0 &&
            clip.duration <= 1 &&
            duration > clip.duration
              ? clampClip(
                  { ...clip, duration: initialDuration || duration },
                  duration,
                )
              : clip,
          );
        });
      }
      if (
        subtitlePath &&
        !tracks.some(
          (track) =>
            track.type === 'subtitle' &&
            track.clips.some((clip) => clip.sourceFile === subtitlePath),
        )
      ) {
        const track =
          tracks.find((item) => item.type === 'subtitle') ||
          tracks[tracks.length - 1];
        track.clips = [
          ...track.clips,
          {
            id: `clip-${Date.now()}-sub`,
            source: subtitlePath,
            sourceFile: subtitlePath,
            startTime: 0,
            duration,
            trimStart: 0,
            trimEnd: 0,
            playbackRate: 1,
            volume: 1,
          },
        ];
      }
      return {
        ...prev,
        duration,
        tracks,
        currentTime: Math.min(prev.currentTime, duration),
      };
    });
  }, [videoPath, subtitlePath, initialDuration]);

  const updateProject = useCallback(
    (updater: (project: TimelineProject) => TimelineProject) =>
      setProject((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        undoStackRef.current = [...undoStackRef.current, prev].slice(-100);
        redoStackRef.current = [];
        return next;
      }),
    [],
  );
  const addTrack = useCallback(
    (type: TimelineTrackType) =>
      updateProject((prev) => ({
        ...prev,
        tracks: [
          ...prev.tracks,
          makeTrack(
            type,
            prev.tracks.filter((track) => track.type === type).length,
          ),
        ],
      })),
    [updateProject],
  );
  const addClip = useCallback(
    (
      trackId: string,
      sourceFile: string,
      clipDuration: number,
      type: TimelineTrackType,
      startTime = 0,
      metadata?: TimelineClip['metadata'],
    ) =>
      updateProject((prev) => {
        const track = prev.tracks.find((item) => item.id === trackId);
        if (!track || track.locked) return prev;
        const clip: TimelineClip = {
          id: `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          source:
            type === 'subtitle'
              ? sourceFile
              : `media://${encodeURIComponent(sourceFile)}`,
          sourceFile,
          startTime,
          duration: Math.min(
            prev.duration,
            Math.max(MIN_CLIP_DURATION, clipDuration || prev.duration),
          ),
          trimStart: 0,
          trimEnd: 0,
          volume: 1,
          mirrorX: false,
          flipY: false,
          metadata,
        };
        const projectDuration = Math.max(
          prev.duration,
          startTime + clip.duration,
        );
        return {
          ...prev,
          duration: projectDuration,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? {
                  ...item,
                  clips: [...item.clips, clampClip(clip, projectDuration)],
                }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const addTimedClips = useCallback(
    (
      trackId: string,
      items: Array<{
        sourceFile: string;
        duration: number;
        startTime: number;
        metadata?: TimelineClip['metadata'];
        subtitleCues?: TimelineClip['subtitleCues'];
        subtitleTimingMode?: TimelineClip['subtitleTimingMode'];
        linkedVideoClipId?: string;
      }>,
      type: TimelineTrackType,
    ) =>
      updateProject((prev) => {
        const track = prev.tracks.find((item) => item.id === trackId);
        if (!track || track.locked || track.type !== type || !items.length)
          return prev;
        const clips: TimelineClip[] = items.map((item, index) => ({
          id: `clip-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
          source:
            type === 'subtitle'
              ? item.sourceFile
              : `media://${encodeURIComponent(item.sourceFile)}`,
          sourceFile: item.sourceFile,
          startTime: Math.max(0, item.startTime),
          duration: Math.max(MIN_CLIP_DURATION, item.duration),
          trimStart: 0,
          trimEnd: 0,
          playbackRate: 1,
          volume: 1,
          mirrorX: false,
          flipY: false,
          metadata: item.metadata,
          subtitleCues: item.subtitleCues,
          subtitleTimingMode: item.subtitleTimingMode,
          linkedVideoClipId: item.linkedVideoClipId,
        }));
        const projectDuration = Math.max(
          prev.duration,
          ...clips.map((clip) => clip.startTime + clip.duration),
        );
        return {
          ...prev,
          duration: projectDuration,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? {
                  ...item,
                  clips: [
                    ...item.clips,
                    ...clips.map((clip) => clampClip(clip, projectDuration)),
                  ],
                }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const hydrateSubtitleClip = useCallback(
    (
      trackId: string,
      clipId: string,
      subtitleCues: NonNullable<TimelineClip['subtitleCues']>,
    ) =>
      setProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id === clipId && !clip.subtitleCues
                    ? {
                        ...clip,
                        subtitleCues,
                        subtitleTimingMode:
                          clip.subtitleTimingMode || 'absolute',
                        duration: Math.max(
                          clip.duration,
                          ...subtitleCues.map((cue) => cue.sourceEndSec),
                        ),
                      }
                    : clip,
                ),
              }
            : track,
        ),
      })),
    [],
  );
  const addClipsToTrack = useCallback(
    (
      trackId: string,
      items: Array<{ sourceFile: string; clipDuration: number }>,
      type: TimelineTrackType,
    ) =>
      updateProject((prev) => {
        const track = prev.tracks.find((item) => item.id === trackId);
        if (!track || track.locked || track.type !== type || !items.length)
          return prev;
        const starts = getSequentialClipStartTimes(
          track.clips,
          items.map((item) => item.clipDuration),
        );
        const clips = items.map((item, index) => ({
          id: `clip-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
          source:
            type === 'subtitle'
              ? item.sourceFile
              : `media://${encodeURIComponent(item.sourceFile)}`,
          sourceFile: item.sourceFile,
          startTime: starts[index],
          duration: Math.max(
            MIN_CLIP_DURATION,
            item.clipDuration || prev.duration,
          ),
          trimStart: 0,
          trimEnd: 0,
          playbackRate: 1,
          volume: 1,
          mirrorX: false,
          flipY: false,
        }));
        const projectDuration = Math.max(
          prev.duration,
          ...clips.map((clip) => clip.startTime + clip.duration),
        );
        return {
          ...prev,
          duration: projectDuration,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? { ...item, clips: [...item.clips, ...clips] }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const updateClip = useCallback(
    (trackId: string, clipId: string, patch: Partial<TimelineClip>) =>
      updateProject((prev) => {
        const track = prev.tracks.find((item) => item.id === trackId);
        const current = track?.clips.find((clip) => clip.id === clipId);
        if (!track || track.locked || !current) return prev;
        const candidate = { ...current, ...patch };
        const rate = Math.max(0.5, Math.min(2, candidate.playbackRate || 1));
        const timelineEnd =
          Math.max(0, candidate.startTime) +
          Math.max(0.05, candidate.duration - candidate.trimEnd) / rate;
        const projectDuration = Math.max(prev.duration, timelineEnd);
        return {
          ...prev,
          duration: projectDuration,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? {
                  ...item,
                  clips: item.clips.map((clip) =>
                    clip.id === clipId
                      ? clampClip(candidate, projectDuration)
                      : clip,
                  ),
                }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const deleteClip = useCallback(
    (trackId: string, clipId: string) =>
      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((track) =>
          track.id === trackId && !track.locked
            ? {
                ...track,
                clips: track.clips.filter((clip) => clip.id !== clipId),
              }
            : track,
        ),
      })),
    [updateProject],
  );
  const duplicateClip = useCallback(
    (trackId: string, clipId: string) =>
      updateProject((prev) => {
        const track = prev.tracks.find((item) => item.id === trackId);
        const source = track?.clips.find((clip) => clip.id === clipId);
        if (!track || !source || track.locked) return prev;
        const startTime = source.startTime + source.duration - source.trimEnd;
        const duplicate = {
          ...source,
          id: `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          startTime,
        };
        const duration = Math.max(
          prev.duration,
          duplicate.startTime + duplicate.duration - duplicate.trimEnd,
        );
        return {
          ...prev,
          duration,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? { ...item, clips: [...item.clips, duplicate] }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const splitClip = useCallback(
    (trackId: string, clipId: string, splitTime: number) =>
      updateProject((prev) => {
        const track = prev.tracks.find((item) => item.id === trackId);
        const clip = track?.clips.find((item) => item.id === clipId);
        if (!track || !clip || track.locked) return prev;
        const split = splitTimelineClip(
          clip,
          splitTime,
          `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        );
        if (!split) return prev;
        const [left, right] = split;
        return {
          ...prev,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? {
                  ...item,
                  clips: item.clips.flatMap((entry) =>
                    entry.id === clipId ? [left, right] : [entry],
                  ),
                }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const moveClipToTrack = useCallback(
    (
      fromTrackId: string,
      toTrackId: string,
      clipId: string,
      startTime: number,
    ) =>
      updateProject((prev) => {
        const from = prev.tracks.find((track) => track.id === fromTrackId);
        const to = prev.tracks.find((track) => track.id === toTrackId);
        const clip = from?.clips.find((item) => item.id === clipId);
        if (
          !from ||
          !to ||
          !clip ||
          from.locked ||
          to.locked ||
          from.type !== to.type
        )
          return prev;
        const moved = clampClip({ ...clip, startTime }, prev.duration);
        return {
          ...prev,
          tracks: prev.tracks.map((track) =>
            track.id === fromTrackId
              ? {
                  ...track,
                  clips: track.clips.filter((item) => item.id !== clipId),
                }
              : track.id === toTrackId
                ? { ...track, clips: [...track.clips, moved] }
                : track,
          ),
        };
      }),
    [updateProject],
  );
  const updateTrack = useCallback(
    (trackId: string, patch: Partial<TimelineTrack>) =>
      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((track) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      })),
    [updateProject],
  );
  const seek = useCallback(
    (time: number) =>
      setProject((prev) => ({
        ...prev,
        currentTime: Math.min(prev.duration, Math.max(0, time)),
      })),
    [],
  );
  const undo = useCallback(() => {
    setProject((current) => {
      const previous = undoStackRef.current.pop();
      if (!previous) return current;
      redoStackRef.current.push(current);
      return previous;
    });
  }, []);
  const redo = useCallback(() => {
    setProject((current) => {
      const next = redoStackRef.current.pop();
      if (!next) return current;
      undoStackRef.current.push(current);
      return next;
    });
  }, []);
  const selectedClip = useMemo(
    () =>
      project.tracks
        .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
        .find(({ clip }) => clip.id === selectedClipId),
    [project.tracks, selectedClipId],
  );

  return {
    project,
    isPlaying,
    setIsPlaying,
    selectedClipId,
    setSelectedClipId,
    selectedClip,
    addTrack,
    addClip,
    addTimedClips,
    addClipsToTrack,
    hydrateSubtitleClip,
    updateClip,
    deleteClip,
    duplicateClip,
    splitClip,
    moveClipToTrack,
    updateTrack,
    seek,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
