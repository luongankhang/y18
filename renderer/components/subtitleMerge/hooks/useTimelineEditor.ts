import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  TimelineClip,
  TimelineProject,
  TimelineTrack,
  TimelineTrackType,
} from '../../../../types/subtitleMerge';

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
  const maxDuration = Math.max(MIN_CLIP_DURATION, duration - startTime);
  return {
    ...clip,
    startTime,
    duration: Math.min(maxDuration, Math.max(MIN_CLIP_DURATION, clip.duration)),
    trimStart: Math.max(0, clip.trimStart),
    trimEnd: Math.max(0, clip.trimEnd),
    volume: Math.max(0, Math.min(2, clip.volume)),
  };
}

export function useTimelineEditor(
  videoPath: string | null,
  subtitlePath: string | null,
  initialDuration: number,
) {
  const [project, setProject] = useState<TimelineProject>({
    duration: Math.max(1, initialDuration || 1),
    currentTime: 0,
    tracks: [
      makeTrack('video', 0),
      makeTrack('audio', 1),
      makeTrack('subtitle', 2),
    ],
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

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
          volume: 1,
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
      setProject((prev) => updater(prev)),
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
          startTime: 0,
          duration: Math.min(
            prev.duration,
            Math.max(MIN_CLIP_DURATION, clipDuration || prev.duration),
          ),
          trimStart: 0,
          trimEnd: 0,
          volume: 1,
        };
        return {
          ...prev,
          tracks: prev.tracks.map((item) =>
            item.id === trackId
              ? { ...item, clips: [...item.clips, clip] }
              : item,
          ),
        };
      }),
    [updateProject],
  );
  const updateClip = useCallback(
    (trackId: string, clipId: string, patch: Partial<TimelineClip>) =>
      updateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((track) =>
          track.id === trackId && !track.locked
            ? {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id === clipId
                    ? clampClip({ ...clip, ...patch }, prev.duration)
                    : clip,
                ),
              }
            : track,
        ),
      })),
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
    updateClip,
    deleteClip,
    moveClipToTrack,
    updateTrack,
    seek,
  };
}
