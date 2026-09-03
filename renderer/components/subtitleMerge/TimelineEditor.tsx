import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AudioLines,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  Mic2,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  TimelineTrack,
  TimelineTrackType,
} from '../../../types/subtitleMerge';
import { useTimelineEditor } from './hooks/useTimelineEditor';
import {
  getTimelineClockTime,
  getTimelineMediaSyncDecision,
  getTimelinePlaybackState,
} from '../../lib/timelinePlayback';

interface TimelineEditorProps {
  videoPath: string | null;
  subtitlePath: string | null;
  duration: number;
  disabled?: boolean;
  onProjectChange?: (
    project: ReturnType<typeof useTimelineEditor>['project'],
  ) => void;
}

const formatTime = (value: number) => {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function trackIcon(type: TimelineTrackType) {
  if (type === 'video') return <Video className="h-3.5 w-3.5" />;
  if (type === 'audio') return <AudioLines className="h-3.5 w-3.5" />;
  return <Mic2 className="h-3.5 w-3.5" />;
}

export default function TimelineEditor({
  videoPath,
  subtitlePath,
  duration,
  disabled = false,
  onProjectChange,
}: TimelineEditorProps) {
  const editor = useTimelineEditor(videoPath, subtitlePath, duration);
  const previewRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef(0);
  const [draggedClip, setDraggedClip] = useState<{
    trackId: string;
    clipId: string;
  } | null>(null);
  const [subtitleText, setSubtitleText] = useState('');
  const [decodeErrors, setDecodeErrors] = useState<string[]>([]);
  const [clockRevision, setClockRevision] = useState(0);
  const [pxPerSecond, setPxPerSecond] = useState(70);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const seekTimeline = useCallback(
    (time: number) => {
      editor.seek(time);
      setClockRevision((revision) => revision + 1);
    },
    [editor.seek],
  );

  useEffect(
    () => onProjectChange?.(editor.project),
    [editor.project, onProjectChange],
  );

  useEffect(() => {
    currentTimeRef.current = editor.project.currentTime;
  }, [editor.project.currentTime]);

  const syncMediaElement = useCallback(
    (media: HTMLMediaElement, shouldPlay: boolean) => {
      const item = editor.project.tracks
        .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
        .find(({ clip }) => clip.id === media.dataset.timelineClip);
      if (!item) {
        media.pause();
        return;
      }
      const playback = getTimelinePlaybackState(
        item.track,
        item.clip,
        editor.project.currentTime,
      );
      const decision = getTimelineMediaSyncDecision(
        playback,
        media.currentTime,
        media.paused,
        shouldPlay,
      );
      if (media instanceof HTMLVideoElement)
        media.style.visibility = decision.visible ? 'visible' : 'hidden';
      media.muted = playback.muted;
      media.volume = playback.volume;
      if (decision.shouldSeek) media.currentTime = decision.sourceTime;
      if (decision.shouldPlay) {
        if (media.paused) media.play().catch(() => undefined);
      } else if (!media.paused) media.pause();
    },
    [editor.project],
  );

  useEffect(() => {
    if (!editor.isPlaying) return;
    const startedAt = performance.now();
    const startedTime = currentTimeRef.current;
    let frameId = 0;
    const tick = (now: number) => {
      const nextTime = getTimelineClockTime(
        startedTime,
        startedAt,
        now,
        editor.project.duration,
      );
      editor.seek(nextTime);
      if (nextTime >= editor.project.duration) {
        editor.setIsPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    clockRevision,
    editor.isPlaying,
    editor.project.duration,
    editor.seek,
    editor.setIsPlaying,
  ]);

  useEffect(() => {
    if (!subtitlePath) {
      setSubtitleText('');
      return;
    }
    let cancelled = false;
    window.ipc
      ?.invoke('readSubtitleFile', { filePath: subtitlePath })
      .then((entries) => {
        if (cancelled) return;
        const active = (entries || []).find((entry: any) => {
          const match = String(entry.startEndTime).match(
            /(\d+):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d+):(\d{2}):(\d{2})[,.](\d{3})/,
          );
          if (!match) return false;
          const start =
            Number(match[1]) * 3600 +
            Number(match[2]) * 60 +
            Number(match[3]) +
            Number(match[4]) / 1000;
          const end =
            Number(match[5]) * 3600 +
            Number(match[6]) * 60 +
            Number(match[7]) +
            Number(match[8]) / 1000;
          return (
            editor.project.currentTime >= start &&
            editor.project.currentTime < end
          );
        });
        setSubtitleText(active?.content?.join('\n') || '');
      })
      .catch(() => setSubtitleText(''));
    return () => {
      cancelled = true;
    };
  }, [subtitlePath, editor.project.currentTime]);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    root
      .querySelectorAll<HTMLMediaElement>('[data-timeline-clip]')
      .forEach((media) => syncMediaElement(media, editor.isPlaying));
  }, [editor.isPlaying, editor.project, syncMediaElement]);

  const togglePlayback = useCallback(() => {
    const shouldPlay = !editor.isPlaying;
    previewRef.current
      ?.querySelectorAll<HTMLMediaElement>('[data-timeline-clip]')
      .forEach((media) => syncMediaElement(media, shouldPlay));
    editor.setIsPlaying(shouldPlay);
  }, [editor.isPlaying, editor.setIsPlaying, syncMediaElement]);

  const splitSelectedClip = useCallback(() => {
    if (!editor.selectedClip) return;
    editor.splitClip(
      editor.selectedClip.track.id,
      editor.selectedClip.clip.id,
      editor.project.currentTime,
    );
  }, [editor]);

  const duplicateSelectedClip = useCallback(() => {
    if (!editor.selectedClip) return;
    editor.duplicateClip(
      editor.selectedClip.track.id,
      editor.selectedClip.clip.id,
    );
  }, [editor]);

  const deleteSelectedClip = useCallback(() => {
    if (!editor.selectedClip) return;
    editor.deleteClip(
      editor.selectedClip.track.id,
      editor.selectedClip.clip.id,
    );
    editor.setSelectedClipId(null);
  }, [editor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]'))
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelectedClip();
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 's'
      ) {
        splitSelectedClip();
      } else if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? editor.redo() : editor.undo();
      } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedClip, editor, splitSelectedClip, togglePlayback]);

  const snapTime = useCallback(
    (track: TimelineTrack, value: number) => {
      const clamped = Math.max(0, value);
      if (!snapEnabled) return clamped;
      const threshold = 8 / pxPerSecond;
      const points = [
        0,
        editor.project.currentTime,
        ...track.clips.flatMap((clip) => [
          clip.startTime,
          clip.startTime + clip.duration - clip.trimEnd,
        ]),
      ];
      const closest = points.reduce(
        (best, point) =>
          Math.abs(point - clamped) < Math.abs(best - clamped) ? point : best,
        clamped,
      );
      return Math.abs(closest - clamped) <= threshold ? closest : clamped;
    },
    [editor.project.currentTime, pxPerSecond, snapEnabled],
  );

  const visibleTracks = useMemo(
    () => [...editor.project.tracks].sort((a, b) => a.order - b.order),
    [editor.project.tracks],
  );
  const mediaItems = useMemo(() => {
    const seen = new Set<string>();
    return visibleTracks.flatMap((track) =>
      track.clips.flatMap((clip) => {
        if (seen.has(clip.sourceFile)) return [];
        seen.add(clip.sourceFile);
        return [{ track, clip }];
      }),
    );
  }, [visibleTracks]);
  const addClipToTrack = async (track: TimelineTrack) => {
    const multiple = track.type === 'video';
    const result = await window.ipc?.invoke(
      multiple ? 'selectFiles' : 'selectFile',
      {
        type: track.type === 'subtitle' ? 'subtitle' : track.type,
        title: `Select ${track.type} file`,
        multiple,
      },
    );
    const filePaths = multiple
      ? result?.filePaths || []
      : result?.filePath
        ? [result.filePath]
        : [];
    if (result?.canceled || !filePaths.length) return;
    const items = await Promise.all(
      filePaths.map(async (sourceFile: string) => {
        if (track.type === 'subtitle')
          return { sourceFile, clipDuration: editor.project.duration };
        const info = await window.ipc?.invoke('subtitleMerge:getVideoInfo', {
          videoPath: sourceFile,
        });
        return {
          sourceFile,
          clipDuration: info?.data?.duration || editor.project.duration,
        };
      }),
    );
    editor.addClipsToTrack(track.id, items, track.type);
  };

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-800/20 bg-gradient-to-b from-slate-950/[0.035] to-transparent shadow-sm dark:border-slate-700/70 dark:from-slate-950/60">
      <CardHeader className="flex-shrink-0 border-b bg-background/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm tracking-tight">
              Video editor
            </CardTitle>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {editor.project.tracks.length} tracks ·{' '}
              {editor.project.tracks.reduce(
                (count, track) => count + track.clips.length,
                0,
              )}{' '}
              clips · {formatTime(editor.project.duration)}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={disabled}
              onClick={() => editor.addTrack('video')}
            >
              <Plus className="mr-1 h-3 w-3" />
              Video track
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={disabled}
              onClick={() => editor.addTrack('audio')}
            >
              <Plus className="mr-1 h-3 w-3" />
              Audio track
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        <div
          ref={previewRef}
          className="group relative mx-auto aspect-video max-h-[32vh] min-h-40 w-full overflow-hidden rounded-lg border border-slate-800 bg-[radial-gradient(circle_at_center,#18202b_0%,#05070a_72%)] shadow-xl"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            seekTimeline(
              ((event.clientX - rect.left) / rect.width) *
                editor.project.duration,
            );
          }}
        >
          {editor.project.tracks
            .filter((track) => track.type === 'video')
            .sort((a, b) => a.order - b.order)
            .flatMap((track) =>
              track.clips.map((clip) => (
                <video
                  key={clip.id}
                  data-timeline-clip={clip.id}
                  src={clip.source}
                  className="absolute inset-0 h-full w-full object-contain"
                  playsInline
                  preload="auto"
                  style={{
                    visibility: getTimelinePlaybackState(
                      editor.project.tracks.find((track) =>
                        track.clips.some((item) => item.id === clip.id),
                      )!,
                      clip,
                      editor.project.currentTime,
                    ).visible
                      ? 'visible'
                      : 'hidden',
                  }}
                  onLoadedMetadata={(event) =>
                    syncMediaElement(event.currentTarget, editor.isPlaying)
                  }
                  onError={() =>
                    setDecodeErrors((prev) =>
                      prev.includes(clip.sourceFile)
                        ? prev
                        : [...prev, clip.sourceFile],
                    )
                  }
                />
              )),
            )}
          {editor.project.tracks
            .filter((track) => track.type === 'audio')
            .flatMap((track) =>
              track.clips.map((clip) => (
                <audio
                  key={clip.id}
                  data-timeline-clip={clip.id}
                  src={clip.source}
                  preload="auto"
                  onLoadedMetadata={(event) =>
                    syncMediaElement(event.currentTarget, editor.isPlaying)
                  }
                  onError={() =>
                    setDecodeErrors((prev) =>
                      prev.includes(clip.sourceFile)
                        ? prev
                        : [...prev, clip.sourceFile],
                    )
                  }
                />
              )),
            )}
          {subtitleText && (
            <div className="pointer-events-none absolute inset-x-4 bottom-6 whitespace-pre-wrap text-center text-lg font-semibold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">
              {subtitleText}
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/55 px-2 py-1 font-mono text-[10px] text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            {formatTime(editor.project.currentTime)} /{' '}
            {formatTime(editor.project.duration)}
          </div>
          {!editor.project.tracks.some(
            (track) =>
              track.type === 'video' &&
              track.clips.some(
                (clip) =>
                  editor.project.currentTime >= clip.startTime &&
                  editor.project.currentTime < clip.startTime + clip.duration,
              ),
          ) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
              <div className="text-center">
                <Video className="mx-auto mb-2 h-7 w-7 opacity-50" />
                <p>No video at this time</p>
                <p className="mt-1 text-[10px] text-white/40">
                  Import media or move the playhead onto a clip
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background/85 p-1.5 shadow-sm">
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8"
            title="Play/Pause (Space)"
            onClick={togglePlayback}
          >
            {editor.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <span className="w-[92px] font-mono text-xs tabular-nums">
            {formatTime(editor.project.currentTime)} /{' '}
            {formatTime(editor.project.duration)}
          </span>
          <div className="min-w-32 flex-1">
            <Slider
              value={[editor.project.currentTime]}
              min={0}
              max={editor.project.duration}
              step={0.01}
              onValueChange={([value]) => seekTimeline(value)}
            />
          </div>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Undo (Ctrl+Z)"
            disabled={!editor.canUndo}
            onClick={editor.undo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Redo (Ctrl+Y)"
            disabled={!editor.canRedo}
            onClick={editor.redo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Split at playhead (S)"
            disabled={!editor.selectedClip}
            onClick={splitSelectedClip}
          >
            <Scissors className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Duplicate selected clip"
            disabled={!editor.selectedClip}
            onClick={duplicateSelectedClip}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Delete selected clip (Delete)"
            disabled={!editor.selectedClip}
            onClick={deleteSelectedClip}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            variant={snapEnabled ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            title="Toggle snapping"
            onClick={() => setSnapEnabled((value) => !value)}
          >
            <Magnet className="h-4 w-4" />
          </Button>
          <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            aria-label="Timeline zoom"
            type="range"
            min={20}
            max={180}
            step={5}
            value={pxPerSecond}
            onChange={(event) => setPxPerSecond(Number(event.target.value))}
            className="w-20"
          />
          <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {decodeErrors.length > 0 && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            Cannot decode: {decodeErrors.join(', ')}
          </div>
        )}
        {mediaItems.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto rounded-lg border bg-muted/20 px-2 py-1.5">
            <span className="sticky left-0 flex-shrink-0 bg-background/90 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Media
            </span>
            {mediaItems.map(({ track, clip }) => (
              <button
                key={`${track.id}-${clip.sourceFile}`}
                className="flex max-w-44 flex-shrink-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[10px] shadow-sm hover:border-sky-500/60"
                title={clip.sourceFile}
                onClick={() => {
                  editor.setSelectedClipId(clip.id);
                  seekTimeline(clip.startTime);
                }}
              >
                {trackIcon(track.type)}
                <span className="truncate">
                  {clip.sourceFile.split(/[\\/]/).pop()}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border bg-background shadow-inner">
          <div
            className="min-w-[700px]"
            style={{
              width: Math.max(700, editor.project.duration * pxPerSecond + 150),
            }}
          >
            <div className="sticky top-0 z-20 ml-40 flex h-8 items-end border-b bg-background/95 font-mono text-[10px] text-muted-foreground backdrop-blur">
              {Array.from(
                { length: Math.ceil(editor.project.duration) + 1 },
                (_, i) => (
                  <span
                    key={i}
                    style={{ width: pxPerSecond }}
                    className="flex-shrink-0 border-l pl-1"
                  >
                    {formatTime(i)}
                  </span>
                ),
              )}
            </div>
            {visibleTracks.map((track) => (
              <div
                key={track.id}
                className="flex min-h-16 border-b last:border-b-0"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  if (!draggedClip) return;
                  const source = editor.project.tracks
                    .find((item) => item.id === draggedClip.trackId)
                    ?.clips.find((clip) => clip.id === draggedClip.clipId);
                  if (!source) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  editor.moveClipToTrack(
                    draggedClip.trackId,
                    track.id,
                    draggedClip.clipId,
                    snapTime(
                      track,
                      (event.clientX - rect.left - 160) / pxPerSecond,
                    ),
                  );
                  setDraggedClip(null);
                }}
              >
                <div className="sticky left-0 z-10 flex w-40 flex-shrink-0 items-center gap-1 border-r bg-background/95 px-2 text-xs backdrop-blur">
                  {trackIcon(track.type)}
                  <input
                    className="min-w-0 flex-1 bg-transparent"
                    value={track.name}
                    onChange={(event) =>
                      editor.updateTrack(track.id, { name: event.target.value })
                    }
                    disabled={disabled || track.locked}
                  />
                  <button
                    onClick={() =>
                      editor.updateTrack(track.id, { locked: !track.locked })
                    }
                  >
                    {track.locked ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      <LockOpen className="h-3 w-3" />
                    )}
                  </button>
                  {track.type === 'video' && (
                    <button
                      onClick={() =>
                        editor.updateTrack(track.id, { hidden: !track.hidden })
                      }
                    >
                      {track.hidden ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>
                  )}
                  {track.type !== 'subtitle' && (
                    <>
                      <button
                        onClick={() =>
                          editor.updateTrack(track.id, { muted: !track.muted })
                        }
                      >
                        {track.muted ? (
                          <VolumeX className="h-3 w-3" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                      </button>
                      <input
                        aria-label="track volume"
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={track.volume}
                        onChange={(event) =>
                          editor.updateTrack(track.id, {
                            volume: Number(event.target.value),
                          })
                        }
                        className="w-10"
                      />
                    </>
                  )}
                  <button
                    onClick={() => addClipToTrack(track)}
                    disabled={disabled || track.locked}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div
                  className="relative flex-1 overflow-hidden"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)',
                    backgroundSize: `${pxPerSecond}px 100%`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-y-0 z-20 w-px bg-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.18)]"
                    style={{
                      left: editor.project.currentTime * pxPerSecond,
                    }}
                  />
                  {track.clips.map((clip) => (
                    <div
                      key={clip.id}
                      draggable={!track.locked}
                      onDragStart={() =>
                        setDraggedClip({ trackId: track.id, clipId: clip.id })
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        editor.setSelectedClipId(clip.id);
                      }}
                      className={`absolute top-2 h-12 cursor-grab select-none overflow-hidden rounded-md border px-2 py-1 text-[10px] shadow-sm active:cursor-grabbing ${editor.selectedClipId === clip.id ? 'z-10 border-sky-500 bg-sky-500/20 ring-1 ring-sky-500/40' : track.type === 'video' ? 'border-cyan-700/60 bg-cyan-950/15 dark:bg-cyan-950/55' : track.type === 'audio' ? 'border-emerald-700/60 bg-emerald-950/15 dark:bg-emerald-950/55' : 'border-amber-700/60 bg-amber-950/15 dark:bg-amber-950/55'}`}
                      style={{
                        left: clip.startTime * pxPerSecond,
                        width: Math.max(8, clip.duration * pxPerSecond),
                        opacity: track.hidden ? 0.35 : 1,
                      }}
                      title={clip.sourceFile}
                      onDoubleClick={() => editor.deleteClip(track.id, clip.id)}
                    >
                      <span className="block truncate font-medium">
                        {clip.sourceFile.split(/[\\/]/).pop()}
                      </span>
                      <span className="mt-1 block font-mono text-[9px] text-muted-foreground">
                        {formatTime(clip.startTime)} ·{' '}
                        {clip.duration.toFixed(1)}s
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>Space: play/pause</span>
          <span>S: split</span>
          <span>Delete: remove</span>
          <span>Ctrl+Z / Ctrl+Y: undo/redo</span>
          <span>Kéo clip và thả lên track để đổi vị trí.</span>
        </div>
        {editor.selectedClip && (
          <div className="rounded-lg border bg-background p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {editor.selectedClip.clip.sourceFile.split(/[\\/]/).pop()}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {editor.selectedClip.track.type} ·{' '}
                  {editor.selectedClip.track.name}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onClick={splitSelectedClip}
                >
                  <Scissors className="mr-1 h-3 w-3" /> Split
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onClick={duplicateSelectedClip}
                >
                  <Copy className="mr-1 h-3 w-3" /> Duplicate
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
              <label>
                Start
                <input
                  type="number"
                  min={0}
                  max={
                    editor.project.duration - editor.selectedClip.clip.duration
                  }
                  step={0.01}
                  value={editor.selectedClip.clip.startTime}
                  onChange={(event) =>
                    editor.updateClip(
                      editor.selectedClip!.track.id,
                      editor.selectedClip!.clip.id,
                      { startTime: Number(event.target.value) },
                    )
                  }
                  className="mt-1 w-full rounded border bg-transparent p-1"
                />
              </label>
              <label>
                Duration
                <input
                  type="number"
                  min={0.05}
                  max={
                    editor.project.duration - editor.selectedClip.clip.startTime
                  }
                  step={0.01}
                  value={editor.selectedClip.clip.duration}
                  onChange={(event) =>
                    editor.updateClip(
                      editor.selectedClip!.track.id,
                      editor.selectedClip!.clip.id,
                      { duration: Number(event.target.value) },
                    )
                  }
                  className="mt-1 w-full rounded border bg-transparent p-1"
                />
              </label>
              <label>
                Trim start
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editor.selectedClip.clip.trimStart}
                  onChange={(event) =>
                    editor.updateClip(
                      editor.selectedClip!.track.id,
                      editor.selectedClip!.clip.id,
                      { trimStart: Number(event.target.value) },
                    )
                  }
                  className="mt-1 w-full rounded border bg-transparent p-1"
                />
              </label>
              <label>
                Trim end
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editor.selectedClip.clip.trimEnd}
                  onChange={(event) =>
                    editor.updateClip(
                      editor.selectedClip!.track.id,
                      editor.selectedClip!.clip.id,
                      { trimEnd: Number(event.target.value) },
                    )
                  }
                  className="mt-1 w-full rounded border bg-transparent p-1"
                />
              </label>
              <label>
                Volume
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={editor.selectedClip.clip.volume}
                  onChange={(event) =>
                    editor.updateClip(
                      editor.selectedClip!.track.id,
                      editor.selectedClip!.clip.id,
                      { volume: Number(event.target.value) },
                    )
                  }
                  className="mt-1 w-full rounded border bg-transparent p-1"
                />
              </label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
