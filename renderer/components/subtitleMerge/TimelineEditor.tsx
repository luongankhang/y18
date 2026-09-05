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
  FlipHorizontal2,
  FlipVertical2,
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
  SubtitleTimingMode,
  TimelineProject,
  TimelineSubtitleCue,
  TimelineTrack,
  TimelineTrackType,
  TimelineTransform,
} from '../../../types/subtitleMerge';
import {
  getActiveSubtitleCues,
  parseSubtitleTimestampToSeconds,
} from '../../../types/timelineSubtitle';
import { useTimelineEditor } from './hooks/useTimelineEditor';
import {
  getTimelineClockTime,
  getTimelineClipDuration,
  getTimelineClipEndTime,
  getTimelineMediaSyncDecision,
  getTimelinePlaybackState,
} from '../../lib/timelinePlayback';
import { buildTimedTtsClipInputs } from '../../lib/timelineTts';

interface TimelineEditorProps {
  videoPath: string | null;
  subtitlePath: string | null;
  duration: number;
  disabled?: boolean;
  onProjectChange?: (
    project: ReturnType<typeof useTimelineEditor>['project'],
  ) => void;
  initialProject?: TimelineProject | null;
}

const subtitleTimingDebug =
  process.env.NEXT_PUBLIC_SUBTITLE_TIMING_DEBUG === 'true';

const formatTime = (value: number) => {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function parseSubtitleRange(
  value: string,
): { start: number; end: number } | null {
  const [start, end] = value.split(/\s+-->\s+/);
  if (!start || !end) return null;
  try {
    return {
      start: parseSubtitleTimestampToSeconds(start.trim()),
      end: parseSubtitleTimestampToSeconds(end.trim().split(/\s+/)[0]),
    };
  } catch {
    return null;
  }
}

interface SubtitleFileEntry {
  id?: string;
  startEndTime?: string;
  content?: string[];
}

function subtitleEntriesToCues(entries: unknown): TimelineSubtitleCue[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: SubtitleFileEntry, index) => {
    const range = parseSubtitleRange(String(entry?.startEndTime || ''));
    const text = Array.isArray(entry?.content)
      ? entry.content.join('\n').trim()
      : '';
    if (!range || !text || range.end <= range.start) return [];
    return [
      {
        id: entry.id || `cue-${index}`,
        text,
        sourceStartSec: range.start,
        sourceEndSec: range.end,
      },
    ];
  });
}

function trackIcon(type: TimelineTrackType) {
  if (type === 'video') return <Video className="h-3.5 w-3.5" />;
  if (type === 'audio') return <AudioLines className="h-3.5 w-3.5" />;
  return <Mic2 className="h-3.5 w-3.5" />;
}

function getVisualTransform(clip: {
  transform?: Partial<TimelineTransform>;
  mirrorX?: boolean;
  flipY?: boolean;
}): TimelineTransform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    mirrorX: Boolean(clip.mirrorX),
    flipY: Boolean(clip.flipY),
    opacity: 1,
    ...clip.transform,
  };
}

export default function TimelineEditor({
  videoPath,
  subtitlePath,
  duration,
  disabled = false,
  onProjectChange,
  initialProject,
}: TimelineEditorProps) {
  const editor = useTimelineEditor(
    videoPath,
    subtitlePath,
    duration,
    initialProject,
  );
  const previewRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef(0);
  const [draggedClip, setDraggedClip] = useState<{
    trackId: string;
    clipId: string;
  } | null>(null);
  const trimGestureRef = useRef<{
    trackId: string;
    clipId: string;
    edge: 'start' | 'end';
    originX: number;
  } | null>(null);
  const visualGestureRef = useRef<{
    trackId: string;
    clipId: string;
    mode: 'move' | 'resize';
    originX: number;
    originY: number;
    width: number;
    height: number;
    transform: TimelineTransform;
  } | null>(null);
  const [subtitleImportMode, setSubtitleImportMode] =
    useState<SubtitleTimingMode>('absolute');
  const [subtitleStatus, setSubtitleStatus] = useState('');
  const hydratingSubtitleRef = useRef(new Set<string>());
  const activeSubtitleDebugRef = useRef('');
  const [decodeErrors, setDecodeErrors] = useState<string[]>([]);
  const [clockRevision, setClockRevision] = useState(0);
  const [pxPerSecond, setPxPerSecond] = useState(70);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showTts, setShowTts] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsMode, setTtsMode] = useState<'auto' | 'design' | 'clone'>('auto');
  const [ttsInstruction, setTtsInstruction] = useState('');
  const [ttsReferenceAudio, setTtsReferenceAudio] = useState('');
  const [ttsReferenceTranscript, setTtsReferenceTranscript] = useState('');
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const [ttsNumStep, setTtsNumStep] = useState<16 | 32>(16);
  const [ttsDevice, setTtsDevice] = useState<'cuda' | 'cpu'>('cuda');
  const [ttsBatchSize, setTtsBatchSize] = useState(4);
  const [ttsStatus, setTtsStatus] = useState('');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsSourceFile, setTtsSourceFile] = useState('');
  const [ttsCues, setTtsCues] = useState<
    Array<{ text: string; start: number; end: number }>
  >([]);
  const [ttsPreview, setTtsPreview] = useState<{
    outputPath: string;
    duration: number;
    waveform: number[];
    request: {
      text: string;
      mode: string;
      language: string;
      speed: number;
      instruction?: string;
      referenceAudio?: string;
    };
  } | null>(null);
  const [ttsRuntime, setTtsRuntime] = useState<{
    available: boolean;
    cudaAvailable: boolean;
    gpuName?: string;
    pythonPath?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    void window.ipc
      ?.invoke('omnivoice:runtime')
      .then(setTtsRuntime)
      .catch(() => setTtsRuntime(null));
  }, []);

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
      media.playbackRate = item.clip.playbackRate || 1;
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
    for (const track of editor.project.tracks.filter(
      (item) => item.type === 'subtitle',
    )) {
      for (const clip of track.clips) {
        if (clip.subtitleCues || hydratingSubtitleRef.current.has(clip.id))
          continue;
        hydratingSubtitleRef.current.add(clip.id);
        void window.ipc
          ?.invoke('readSubtitleFile', { filePath: clip.sourceFile })
          .then((entries) => {
            const cues = subtitleEntriesToCues(entries);
            editor.hydrateSubtitleClip(track.id, clip.id, cues);
          })
          .catch((error) =>
            setSubtitleStatus(
              error instanceof Error ? error.message : String(error),
            ),
          )
          .finally(() => hydratingSubtitleRef.current.delete(clip.id));
      }
    }
  }, [editor.project.tracks, editor.hydrateSubtitleClip]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const gesture = trimGestureRef.current;
      if (!gesture) return;
      editor.trimClip(
        gesture.trackId,
        gesture.clipId,
        gesture.edge,
        (event.clientX - gesture.originX) / pxPerSecond,
      );
    };
    const end = () => {
      trimGestureRef.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
  }, [editor.trimClip, pxPerSecond]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const gesture = visualGestureRef.current;
      if (!gesture) return;
      const dx = (event.clientX - gesture.originX) / gesture.width;
      const dy = (event.clientY - gesture.originY) / gesture.height;
      const transform =
        gesture.mode === 'move'
          ? {
              ...gesture.transform,
              x: gesture.transform.x + dx,
              y: gesture.transform.y + dy,
            }
          : {
              ...gesture.transform,
              scaleX: Math.max(
                0.05,
                Math.min(4, gesture.transform.scaleX * (1 + dx)),
              ),
              scaleY: Math.max(
                0.05,
                Math.min(4, gesture.transform.scaleY * (1 + dy)),
              ),
            };
      editor.updateClip(gesture.trackId, gesture.clipId, { transform });
    };
    const end = () => {
      visualGestureRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
  }, [editor.updateClip]);

  const activeSubtitleCues = useMemo(
    () =>
      getActiveSubtitleCues(
        editor.project.currentTime,
        editor.project.tracks,
        editor.project.duration,
      ),
    [
      editor.project.currentTime,
      editor.project.duration,
      editor.project.tracks,
    ],
  );

  const selectedVisual = useMemo(() => {
    if (!editor.selectedClip || editor.selectedClip.track.type !== 'video')
      return null;
    return {
      ...editor.selectedClip,
      transform: getVisualTransform(editor.selectedClip.clip),
    };
  }, [editor.selectedClip]);

  useEffect(() => {
    if (!subtitleTimingDebug) return;
    const identity = activeSubtitleCues
      .map((cue) => `${cue.trackId}:${cue.clipId}:${cue.cueId}`)
      .join('|');
    if (identity === activeSubtitleDebugRef.current) return;
    activeSubtitleDebugRef.current = identity;
    console.debug(
      '[SubtitleTiming] active cues changed',
      activeSubtitleCues.map((cue) => ({
        projectCurrentTimeSec: editor.project.currentTime,
        subtitleTrackId: cue.trackId,
        subtitleClipId: cue.clipId,
        cueId: cue.cueId,
        cueStartSec: cue.cueStartSec,
        cueEndSec: cue.cueEndSec,
        linkedVideoClipId: cue.linkedVideoClipId,
        calculatedLocalTimeSec: cue.calculatedLocalTimeSec,
        isActive: true,
      })),
    );
  }, [activeSubtitleCues, editor.project.currentTime]);

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

  const toggleSelectedVisualTransform = useCallback(
    (field: 'mirrorX' | 'flipY') => {
      const selected = editor.selectedClip;
      if (!selected || selected.track.type !== 'video' || selected.track.locked)
        return;
      editor.updateClip(selected.track.id, selected.clip.id, {
        [field]: !selected.clip[field],
      });
    },
    [editor],
  );

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
          clip.startTime + getTimelineClipDuration(clip),
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
    if (track.type === 'subtitle') {
      const selectedVideo =
        editor.selectedClip?.track.type === 'video'
          ? editor.selectedClip.clip
          : undefined;
      if (subtitleImportMode === 'linked-video' && !selectedVideo) {
        setSubtitleStatus(
          'Hãy chọn một video clip trước khi dùng chế độ khớp video.',
        );
        return;
      }
      const sourceFile = filePaths[0];
      try {
        const entries = await window.ipc?.invoke('readSubtitleFile', {
          filePath: sourceFile,
        });
        const cues = subtitleEntriesToCues(entries);
        if (!cues.length) throw new Error('SUBTITLE_HAS_NO_VALID_CUES');
        const sourceDuration = Math.max(
          0.05,
          ...cues.map((cue) => cue.sourceEndSec),
        );
        editor.addTimedClips(
          track.id,
          [
            {
              sourceFile,
              duration: sourceDuration,
              startTime:
                subtitleImportMode === 'playhead'
                  ? editor.project.currentTime
                  : subtitleImportMode === 'linked-video'
                    ? selectedVideo!.startTime
                    : 0,
              subtitleCues: cues,
              subtitleTimingMode: subtitleImportMode,
              linkedVideoClipId:
                subtitleImportMode === 'linked-video'
                  ? selectedVideo!.id
                  : undefined,
            },
          ],
          'subtitle',
        );
        setSubtitleStatus(
          `Đã thêm ${cues.length} cue (${subtitleImportMode}) bằng một transaction.`,
        );
      } catch (error) {
        setSubtitleStatus(
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }
    const items = await Promise.all(
      filePaths.map(async (sourceFile: string) => {
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

  const createTtsClip = async () => {
    if (!ttsText.trim() || !window.ipc) return;
    if (ttsMode === 'clone' && !ttsReferenceAudio) {
      setTtsStatus('Voice clone cần file reference audio.');
      return;
    }
    const audioTrack = editor.project.tracks.find(
      (track) => track.type === 'audio' && !track.locked,
    );
    if (!audioTrack) {
      setTtsStatus('Không có audio track đang mở khóa.');
      return;
    }
    setTtsStatus('Đang tạo giọng...');
    setTtsBusy(true);
    try {
      const request = {
        mode: ttsMode,
        instruction: ttsInstruction || undefined,
        referenceAudio: ttsReferenceAudio || undefined,
        referenceTranscript: ttsReferenceTranscript || undefined,
        language: 'vi',
        speed: ttsSpeed,
        numStep: ttsNumStep,
        device: ttsDevice,
        seed: 2025,
      };
      if (ttsCues.length > 0) {
        setTtsStatus(
          `Đang sinh batch ${ttsCues.length} cue bằng ${ttsDevice.toUpperCase()}...`,
        );
        const batchItems = ttsCues.map((cue, index) => ({
          id: `cue-${index}`,
          text: cue.text,
        }));
        const job = await window.ipc.invoke('omnivoice:generate-batch', {
          ...request,
          items: batchItems,
          batchSize: ttsBatchSize,
        });
        if (job?.status === 'cancelled') {
          setTtsStatus('Đã hủy tạo voice; không có clip nào được thêm.');
          return;
        }
        if (
          !Array.isArray(job?.outputs) ||
          job.outputs.length !== ttsCues.length
        )
          throw new Error(job?.error || 'OMNIVOICE_BATCH_OUTPUT_INVALID');
        const timedTtsClips = buildTimedTtsClipInputs(
          ttsCues.map((cue, index) => ({
            id: `cue-${index}`,
            text: cue.text,
            start: cue.start,
            end: cue.end,
          })),
          job.outputs,
          {
            generator: 'omnivoice',
            modelId: 'k2-fsa/OmniVoice',
            mode: ttsMode,
            language: 'vi',
            speed: ttsSpeed,
            generatedAt: Date.now(),
          },
        );
        if (timedTtsClips.length !== ttsCues.length)
          throw new Error('OMNIVOICE_TIMELINE_CUE_MAPPING_INVALID');
        editor.addTimedClips(audioTrack.id, timedTtsClips, 'audio');
        setTtsText('');
        setTtsCues([]);
        setTtsSourceFile('');
        const seconds = Number(job.timings?.total_ms || 0) / 1000;
        setTtsStatus(
          `Đã sinh và xếp ${ttsCues.length} cue trong ${seconds.toFixed(1)} giây. Worker PID ${job.runtime?.pid || '?'}, model load ${job.runtime?.modelLoadCount ?? '?'}.`,
        );
        return;
      }
      const job = await window.ipc.invoke('omnivoice:generate', {
        ...request,
        text: ttsText,
      });
      if (job?.status === 'cancelled') {
        setTtsStatus('Đã hủy tạo voice; kết quả không được thêm vào timeline.');
        return;
      }
      if (!job?.outputPath || !job.duration)
        throw new Error(job?.error || 'OMNIVOICE_OUTPUT_INVALID');
      setTtsPreview({
        outputPath: job.outputPath,
        duration: job.duration,
        waveform: Array.isArray(job.waveform) ? job.waveform : [],
        request: {
          text: ttsText.trim(),
          mode: ttsMode,
          language: 'vi',
          speed: ttsSpeed,
          instruction: ttsInstruction || undefined,
          referenceAudio: ttsReferenceAudio || undefined,
        },
      });
      setTtsStatus(
        `Đã tạo xong trong ${(Number(job.timings?.total_ms || 0) / 1000).toFixed(1)} giây. Hãy nghe thử trước khi thêm vào timeline.`,
      );
    } catch (error) {
      setTtsStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTtsBusy(false);
    }
  };

  const loadTtsSourceFile = async () => {
    if (!window.ipc) return;
    const selected = await window.ipc.invoke('selectFile', {
      type: 'text',
      title: 'Chọn file phụ đề hoặc văn bản để tạo voice',
    });
    if (selected?.canceled || !selected?.filePath) return;
    const filePath = selected.filePath as string;
    const extension = filePath.toLowerCase().split('.').pop();
    const result = ['srt', 'vtt', 'ass', 'ssa', 'lrc'].includes(extension || '')
      ? await window.ipc.invoke('readSubtitleFile', { filePath })
      : await window.ipc.invoke('readTextFile', { filePath });
    const content = Array.isArray(result)
      ? result
          .map((entry) => entry.content?.join(' ') || '')
          .filter(Boolean)
          .join('\n')
      : result?.content || '';
    if (!content.trim()) {
      setTtsStatus('File không có nội dung đọc được.');
      return;
    }
    setTtsSourceFile(filePath);
    setTtsText(content.trim());
    setTtsCues(
      Array.isArray(result)
        ? result
            .map((entry) => ({
              text: entry.content?.join(' ').trim() || '',
              ...(parseSubtitleRange(String(entry.startEndTime)) || {
                start: 0,
                end: 0,
              }),
            }))
            .filter((cue) => cue.text && cue.end > cue.start)
        : [],
    );
    setTtsStatus(`Đã nạp nội dung từ ${filePath.split(/[\\/]/).pop()}.`);
  };

  const addPreviewedTts = () => {
    if (!ttsPreview) return;
    const audioTrack = editor.project.tracks.find(
      (track) => track.type === 'audio' && !track.locked,
    );
    if (!audioTrack) {
      setTtsStatus('Không có audio track đang mở khóa.');
      return;
    }
    editor.addClip(
      audioTrack.id,
      ttsPreview.outputPath,
      ttsPreview.duration,
      'audio',
      editor.project.currentTime,
      {
        generator: 'omnivoice',
        modelId: 'k2-fsa/OmniVoice',
        ...ttsPreview.request,
        generatedAt: Date.now(),
      },
    );
    setTtsText('');
    setTtsPreview(null);
    setTtsStatus('Đã thêm voice vào audio track tại playhead.');
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
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={disabled}
              onClick={() => editor.addTrack('subtitle')}
            >
              <Plus className="mr-1 h-3 w-3" />
              Subtitle track
            </Button>
            <select
              value={subtitleImportMode}
              onChange={(event) =>
                setSubtitleImportMode(event.target.value as SubtitleTimingMode)
              }
              className="h-8 rounded border bg-background px-2 text-[10px]"
              aria-label="Chế độ thời gian subtitle"
            >
              <option value="absolute">Giữ timecode gốc</option>
              <option value="linked-video">Khớp video đang chọn</option>
              <option value="playhead">Chèn từ playhead</option>
            </select>
            <Button
              size="sm"
              variant={showTts ? 'default' : 'outline'}
              className="h-8"
              disabled={disabled}
              onClick={() => setShowTts((visible) => !visible)}
            >
              <Mic2 className="mr-1 h-3 w-3" />
              Thêm voice
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {subtitleStatus && (
          <p className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] text-muted-foreground">
            {subtitleStatus}
          </p>
        )}
        {showTts && (
          <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">OmniVoice TTS</p>
              <span className="text-[10px] text-muted-foreground">
                Tại playhead
              </span>
            </div>
            <div className="flex items-center justify-between rounded border bg-background/60 px-2 py-1 text-[10px]">
              <span>
                {ttsRuntime?.available
                  ? `Runtime ${ttsRuntime.cudaAvailable ? `GPU: ${ttsRuntime.gpuName || 'CUDA'}` : 'CPU'}`
                  : 'Chưa có runtime OmniVoice'}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px]"
                onClick={async () => {
                  const result = await window.ipc?.invoke(
                    'omnivoice:select-runtime',
                  );
                  if (result) setTtsRuntime(result);
                }}
              >
                Chọn Python runtime
              </Button>
            </div>
            <textarea
              value={ttsText}
              onChange={(event) => setTtsText(event.target.value)}
              placeholder="Nhập nội dung cần tạo giọng..."
              className="min-h-20 w-full rounded border bg-background p-2 text-xs"
              disabled={disabled}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={loadTtsSourceFile}
                disabled={disabled}
              >
                Nạp từ file phụ đề / text
              </Button>
              {ttsSourceFile && (
                <span className="truncate text-[10px] text-muted-foreground">
                  {ttsSourceFile.split(/[\\/]/).pop()}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={ttsMode}
                onChange={(event) =>
                  setTtsMode(event.target.value as typeof ttsMode)
                }
                className="h-8 rounded border bg-background px-2 text-xs"
                disabled={disabled}
              >
                <option value="auto">Auto voice</option>
                <option value="design">Voice design</option>
                <option value="clone">Voice clone</option>
              </select>
              <select
                value={ttsNumStep}
                onChange={(event) =>
                  setTtsNumStep(Number(event.target.value) as 16 | 32)
                }
                className="h-8 rounded border bg-background px-2 text-xs"
                disabled={disabled}
                aria-label="Chất lượng OmniVoice"
              >
                <option value={16}>Nhanh (16 bước)</option>
                <option value={32}>Chất lượng (32 bước)</option>
              </select>
              <select
                value={ttsDevice}
                onChange={(event) =>
                  setTtsDevice(event.target.value as 'cuda' | 'cpu')
                }
                className="h-8 rounded border bg-background px-2 text-xs"
                disabled={disabled}
                aria-label="Thiết bị OmniVoice"
              >
                <option value="cuda">GPU CUDA</option>
                <option value="cpu">CPU</option>
              </select>
              <label className="flex h-8 items-center gap-1 rounded border bg-background px-2 text-[10px]">
                Tốc độ
                <input
                  type="number"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={ttsSpeed}
                  onChange={(event) =>
                    setTtsSpeed(
                      Math.max(
                        0.5,
                        Math.min(2, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className="w-14 bg-transparent text-xs"
                  aria-label="Tốc độ đọc OmniVoice"
                />
              </label>
              {ttsCues.length > 0 && (
                <label className="flex h-8 items-center gap-1 rounded border bg-background px-2 text-[10px]">
                  Batch
                  <select
                    value={ttsBatchSize}
                    onChange={(event) =>
                      setTtsBatchSize(Number(event.target.value))
                    }
                    className="bg-transparent text-xs"
                    aria-label="Kích thước batch OmniVoice"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                  </select>
                </label>
              )}
              {ttsMode === 'design' && (
                <input
                  value={ttsInstruction}
                  onChange={(event) => setTtsInstruction(event.target.value)}
                  placeholder="female, warm voice"
                  className="h-8 min-w-48 flex-1 rounded border bg-background px-2 text-xs"
                  disabled={disabled}
                />
              )}
              {ttsMode === 'clone' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={async () => {
                      const result = await window.ipc?.invoke('selectFile', {
                        type: 'audio',
                        title: 'Chọn reference audio',
                      });
                      if (!result?.canceled)
                        setTtsReferenceAudio(result?.filePath || '');
                    }}
                  >
                    {ttsReferenceAudio
                      ? 'Đã chọn reference'
                      : 'Chọn reference audio'}
                  </Button>
                  <input
                    value={ttsReferenceTranscript}
                    onChange={(event) =>
                      setTtsReferenceTranscript(event.target.value)
                    }
                    placeholder="Transcript reference (tuỳ chọn)"
                    className="h-8 min-w-48 flex-1 rounded border bg-background px-2 text-xs"
                    disabled={disabled}
                  />
                </>
              )}
              <Button
                size="sm"
                className="h-8"
                onClick={createTtsClip}
                disabled={disabled || ttsBusy || !ttsText.trim()}
              >
                {ttsBusy ? 'Đang tạo voice...' : 'Tạo và thêm vào timeline'}
              </Button>
              {ttsBusy && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={async () => {
                    const jobs = await window.ipc?.invoke('omnivoice:list');
                    const running = Array.isArray(jobs)
                      ? jobs.find((job) => job.status !== 'cancelled')
                      : null;
                    if (running?.id) {
                      await window.ipc?.invoke('omnivoice:cancel', running.id);
                      setTtsStatus(
                        'Đã yêu cầu hủy. Kernel GPU hiện tại sẽ kết thúc nhưng kết quả sẽ không được thêm vào timeline.',
                      );
                    }
                  }}
                >
                  Hủy
                </Button>
              )}
            </div>
            {ttsStatus && (
              <p
                className="text-[10px] text-muted-foreground"
                data-testid="omnivoice-status"
              >
                {ttsStatus}
              </p>
            )}
            {ttsPreview && (
              <div className="space-y-2 rounded border bg-background/70 p-2">
                <audio
                  controls
                  preload="metadata"
                  className="h-8 w-full"
                  src={`media://${encodeURIComponent(ttsPreview.outputPath)}`}
                />
                <div
                  className="flex h-10 items-end gap-px overflow-hidden"
                  aria-label="OmniVoice waveform"
                >
                  {ttsPreview.waveform.map((value, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t bg-sky-500/70"
                      style={{
                        height: `${Math.max(4, Math.round(value * 100))}%`,
                      }}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  className="h-8 w-full"
                  onClick={addPreviewedTts}
                >
                  Thêm bản nghe thử vào timeline
                </Button>
              </div>
            )}
          </div>
        )}
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
            // Lower rows render first; the top timeline row (smaller order)
            // is mounted last and therefore composites above them.
            .sort((a, b) => b.order - a.order)
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
                    left: '50%',
                    top: '50%',
                    width: '100%',
                    height: '100%',
                    opacity: getVisualTransform(clip).opacity,
                    transform: `translate(calc(-50% + ${getVisualTransform(clip).x * 100}%), calc(-50% + ${getVisualTransform(clip).y * 100}%)) scale(${getVisualTransform(clip).scaleX * (getVisualTransform(clip).mirrorX ? -1 : 1)}, ${getVisualTransform(clip).scaleY * (getVisualTransform(clip).flipY ? -1 : 1)}) rotate(${getVisualTransform(clip).rotation}deg)`,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const rect = previewRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    editor.setSelectedClipId(clip.id);
                    visualGestureRef.current = {
                      trackId: editor.project.tracks.find((item) =>
                        item.clips.some(
                          (candidate) => candidate.id === clip.id,
                        ),
                      )!.id,
                      clipId: clip.id,
                      mode: 'move',
                      originX: event.clientX,
                      originY: event.clientY,
                      width: rect.width,
                      height: rect.height,
                      transform: getVisualTransform(clip),
                    };
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
          {selectedVisual && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 border border-sky-400 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
              style={{
                width: `${selectedVisual.transform.scaleX * 100}%`,
                height: `${selectedVisual.transform.scaleY * 100}%`,
                opacity: selectedVisual.transform.opacity,
                transform: `translate(calc(-50% + ${selectedVisual.transform.x * 100}%), calc(-50% + ${selectedVisual.transform.y * 100}%)) rotate(${selectedVisual.transform.rotation}deg)`,
              }}
            >
              <button
                aria-label="Resize selected visual layer"
                className="pointer-events-auto absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-sky-400"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const rect = previewRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  visualGestureRef.current = {
                    trackId: selectedVisual.track.id,
                    clipId: selectedVisual.clip.id,
                    mode: 'resize',
                    originX: event.clientX,
                    originY: event.clientY,
                    width: rect.width,
                    height: rect.height,
                    transform: selectedVisual.transform,
                  };
                }}
              />
            </div>
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
          {activeSubtitleCues.map((cue, index) => (
            <div
              key={`${cue.trackId}-${cue.clipId}-${cue.cueId}`}
              className="pointer-events-none absolute inset-x-4 whitespace-pre-wrap text-center text-lg font-semibold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]"
              style={{ bottom: `${24 + index * 34}px` }}
              data-subtitle-cue={cue.cueId}
            >
              {cue.text}
            </div>
          ))}
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
                  editor.project.currentTime < getTimelineClipEndTime(clip),
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
                  {track.type !== 'audio' && (
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
                  <button
                    title="Delete track"
                    disabled={disabled || track.locked}
                    onClick={() => editor.deleteTrack(track.id)}
                  >
                    <Trash2 className="h-3 w-3" />
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
                      className={`relative absolute top-2 h-12 cursor-grab select-none overflow-hidden rounded-md border px-2 py-1 text-[10px] shadow-sm active:cursor-grabbing ${editor.selectedClipId === clip.id ? 'z-10 border-sky-500 bg-sky-500/20 ring-1 ring-sky-500/40' : track.type === 'video' ? 'border-cyan-700/60 bg-cyan-950/15 dark:bg-cyan-950/55' : track.type === 'audio' ? 'border-emerald-700/60 bg-emerald-950/15 dark:bg-emerald-950/55' : 'border-amber-700/60 bg-amber-950/15 dark:bg-amber-950/55'}`}
                      style={{
                        left: clip.startTime * pxPerSecond,
                        width: Math.max(
                          8,
                          getTimelineClipDuration(clip) * pxPerSecond,
                        ),
                        opacity: track.hidden ? 0.35 : 1,
                      }}
                      title={clip.sourceFile}
                      onDoubleClick={() => editor.deleteClip(track.id, clip.id)}
                    >
                      <span
                        aria-label="Trim start"
                        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-sky-500/40 opacity-0 transition-opacity hover:opacity-100"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          trimGestureRef.current = {
                            trackId: track.id,
                            clipId: clip.id,
                            edge: 'start',
                            originX: event.clientX,
                          };
                        }}
                      />
                      <span
                        aria-label="Trim end"
                        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-sky-500/40 opacity-0 transition-opacity hover:opacity-100"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          trimGestureRef.current = {
                            trackId: track.id,
                            clipId: clip.id,
                            edge: 'end',
                            originX: event.clientX,
                          };
                        }}
                      />
                      <span className="block truncate font-medium">
                        {clip.sourceFile.split(/[\\/]/).pop()}
                      </span>
                      <span className="mt-1 block font-mono text-[9px] text-muted-foreground">
                        {formatTime(clip.startTime)} ·{' '}
                        {getTimelineClipDuration(clip).toFixed(1)}s
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
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
              <label>
                Start
                <input
                  type="number"
                  min={0}
                  max={
                    editor.project.duration -
                    getTimelineClipDuration(editor.selectedClip.clip)
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
              <label>
                Speed
                <input
                  type="number"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={editor.selectedClip.clip.playbackRate || 1}
                  onChange={(event) =>
                    editor.updateClip(
                      editor.selectedClip!.track.id,
                      editor.selectedClip!.clip.id,
                      { playbackRate: Number(event.target.value) },
                    )
                  }
                  className="mt-1 w-full rounded border bg-transparent p-1"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              <Button
                type="button"
                size="sm"
                variant={editor.selectedClip.clip.flipY ? 'default' : 'outline'}
                className="h-8 text-xs"
                disabled={
                  disabled ||
                  editor.selectedClip.track.type !== 'video' ||
                  editor.selectedClip.track.locked
                }
                title="Đảo phần trên và dưới của clip"
                onClick={() => toggleSelectedVisualTransform('flipY')}
              >
                <FlipVertical2 className="mr-1.5 h-3.5 w-3.5" />
                Lật ngang
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  editor.selectedClip.clip.mirrorX ? 'default' : 'outline'
                }
                className="h-8 text-xs"
                disabled={
                  disabled ||
                  editor.selectedClip.track.type !== 'video' ||
                  editor.selectedClip.track.locked
                }
                title="Đảo trái và phải giống hình ảnh trong gương"
                onClick={() => toggleSelectedVisualTransform('mirrorX')}
              >
                <FlipHorizontal2 className="mr-1.5 h-3.5 w-3.5" />
                Phản chiếu
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
