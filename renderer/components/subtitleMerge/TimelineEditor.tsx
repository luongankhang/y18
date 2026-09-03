import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AudioLines,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Mic2,
  Pause,
  Play,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  Video,
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
  const pxPerSecond = 70;

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

  const visibleTracks = useMemo(
    () => [...editor.project.tracks].sort((a, b) => a.order - b.order),
    [editor.project.tracks],
  );
  const moveClip = (trackId: string, clipId: string, clientX: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    editor.updateClip(trackId, clipId, {
      startTime:
        (clientX - rect.left + previewRef.current!.scrollLeft) / pxPerSecond,
    });
  };
  const addClipToTrack = async (track: TimelineTrack) => {
    const result = await window.ipc?.invoke('selectFile', {
      type: track.type === 'subtitle' ? 'subtitle' : track.type,
      title: `Select ${track.type} file`,
    });
    if (result?.canceled || !result?.filePath) return;
    const info =
      track.type === 'subtitle'
        ? null
        : await window.ipc?.invoke('subtitleMerge:getVideoInfo', {
            videoPath: result.filePath,
          });
    editor.addClip(
      track.id,
      result.filePath,
      info?.data?.duration || editor.project.duration,
      track.type,
    );
  };

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0 py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Multi-track timeline</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => editor.addTrack('video')}
            >
              <Plus className="mr-1 h-3 w-3" />
              Thêm video track
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => editor.addTrack('audio')}
            >
              <Plus className="mr-1 h-3 w-3" />
              Thêm audio track
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4">
        <div
          ref={previewRef}
          className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
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
              No video at this time
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={togglePlayback}>
            {editor.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <span className="w-12 text-xs">
            {formatTime(editor.project.currentTime)}
          </span>
          <Slider
            value={[editor.project.currentTime]}
            min={0}
            max={editor.project.duration}
            step={0.01}
            onValueChange={([value]) => seekTimeline(value)}
          />
          <span className="w-12 text-right text-xs">
            {formatTime(editor.project.duration)}
          </span>
        </div>
        {decodeErrors.length > 0 && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            Cannot decode: {decodeErrors.join(', ')}
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <div
            className="min-w-[700px]"
            style={{
              width: Math.max(700, editor.project.duration * pxPerSecond + 150),
            }}
          >
            <div className="ml-36 flex h-7 items-end border-b text-[10px] text-muted-foreground">
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
                className="flex min-h-14 border-b last:border-b-0"
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
                    (event.clientX - rect.left - 144) / pxPerSecond,
                  );
                  setDraggedClip(null);
                }}
              >
                <div className="flex w-36 flex-shrink-0 items-center gap-1 border-r px-2 text-xs">
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
                  className="relative flex-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)',
                    backgroundSize: `${pxPerSecond}px 100%`,
                  }}
                >
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
                      className={`absolute top-2 h-10 cursor-grab overflow-hidden rounded border px-1 text-[10px] ${editor.selectedClipId === clip.id ? 'border-primary bg-primary/30' : 'border-muted-foreground/40 bg-muted'}`}
                      style={{
                        left: clip.startTime * pxPerSecond,
                        width: Math.max(8, clip.duration * pxPerSecond),
                        opacity: track.hidden ? 0.35 : 1,
                      }}
                      title={clip.sourceFile}
                      onDoubleClick={() => editor.deleteClip(track.id, clip.id)}
                    >
                      <span className="truncate">
                        {clip.sourceFile.split(/[\\/]/).pop()}
                      </span>
                      <input
                        aria-label="clip start"
                        type="range"
                        min={0}
                        max={Math.max(
                          0,
                          editor.project.duration - clip.duration,
                        )}
                        step={0.01}
                        value={clip.startTime}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          editor.updateClip(track.id, clip.id, {
                            startTime: Number(event.target.value),
                          })
                        }
                        className="absolute bottom-0 left-0 w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Kéo clip ngang bằng thanh điều khiển trong clip; double-click để xóa.
          Clip chỉ có thể nằm trong thời lượng project. Track khóa không cho
          chỉnh sửa.
        </div>
        {editor.selectedClip && (
          <div className="grid grid-cols-2 gap-2 rounded-md border p-2 text-xs md:grid-cols-4">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
