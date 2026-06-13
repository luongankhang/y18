/**
 * 合并页预览会话：播放控制 + 字幕 cue 编辑
 * 播放进度采用节流，避免每帧触发整页重渲染
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { toast } from 'sonner';
import { useTranslation } from 'next-i18next';
import type { MergeCue, SubtitleStyle } from '../../../../types/subtitleMerge';
import { wrapSubtitleTextForPreview } from '../../../lib/subtitleTextWrap';
import { parseTimeRange, secondsToTime } from '../utils/timeUtils';

const UI_TIME_THROTTLE_MS = 250;

function mapSubtitleToCue(subtitle: {
  id: string;
  startEndTime: string;
  sourceContent?: string;
  content?: string[];
  startTimeInSeconds?: number;
  endTimeInSeconds?: number;
}): MergeCue {
  const { start, end } = parseTimeRange(subtitle.startEndTime);
  return {
    id: subtitle.id,
    startEndTime: subtitle.startEndTime,
    text: subtitle.sourceContent || subtitle.content?.join('\n') || '',
    startTimeInSeconds: subtitle.startTimeInSeconds ?? start,
    endTimeInSeconds: subtitle.endTimeInSeconds ?? end,
  };
}

function mapCueToSubtitle(cue: MergeCue) {
  return {
    id: cue.id,
    startEndTime: cue.startEndTime,
    content: cue.text.split('\n'),
    sourceContent: cue.text,
    startTimeInSeconds: cue.startTimeInSeconds,
    endTimeInSeconds: cue.endTimeInSeconds,
  };
}

function findActiveCueIndex(cues: MergeCue[], time: number): number {
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    if (time >= cue.startTimeInSeconds && time < cue.endTimeInSeconds) {
      return i;
    }
  }
  return -1;
}

export function useMergePreviewSession(
  subtitlePath: string | null,
  style: SubtitleStyle,
  videoWidth: number | null | undefined,
) {
  const { t } = useTranslation('subtitleMerge');
  const playerRef = useRef<ReactPlayer>(null);

  const [cues, setCues] = useState<MergeCue[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);
  const [uiCurrentTime, setUiCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [previewText, setPreviewText] = useState('');

  const cuesRef = useRef(cues);
  const styleRef = useRef(style);
  const videoWidthRef = useRef(videoWidth);
  const activeIndexRef = useRef(-1);
  const currentTimeRef = useRef(0);
  const lastUiSyncRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  useEffect(() => {
    videoWidthRef.current = videoWidth;
  }, [videoWidth]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const syncPreviewText = useCallback((index: number) => {
    const cue = cuesRef.current[index];
    if (!cue) {
      setPreviewText('');
      return;
    }
    setPreviewText(
      wrapSubtitleTextForPreview(
        cue.text,
        styleRef.current,
        videoWidthRef.current,
      ),
    );
  }, []);

  const syncActiveCue = useCallback(
    (time: number, force = false) => {
      const nextIndex = findActiveCueIndex(cuesRef.current, time);
      if (!force && nextIndex === activeIndexRef.current) {
        return;
      }
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      if (nextIndex >= 0) {
        syncPreviewText(nextIndex);
      } else {
        setPreviewText('');
      }
    },
    [syncPreviewText],
  );

  const flushUiTime = useCallback((time: number) => {
    currentTimeRef.current = time;
    setUiCurrentTime(time);
    lastUiSyncRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (!subtitlePath) {
      setCues([]);
      setSelectedIndex(-1);
      setIsDirty(false);
      setActiveIndex(-1);
      setPreviewText('');
      activeIndexRef.current = -1;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const entries = await window.ipc.invoke('readSubtitleFile', {
          filePath: subtitlePath,
        });
        if (cancelled) return;
        const loaded = (entries || []).map(mapSubtitleToCue);
        setCues(loaded);
        cuesRef.current = loaded;
        setSelectedIndex(-1);
        setIsDirty(false);
        setActiveIndex(-1);
        activeIndexRef.current = -1;
        setPreviewText('');
      } catch (error) {
        console.error('加载字幕失败:', error);
        if (!cancelled) {
          setCues([]);
          cuesRef.current = [];
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subtitlePath]);

  useEffect(() => {
    if (activeIndexRef.current >= 0) {
      syncPreviewText(activeIndexRef.current);
    }
  }, [
    style.fontSize,
    style.marginL,
    style.marginR,
    videoWidth,
    syncPreviewText,
  ]);

  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(0, time);
      flushUiTime(clamped);
      syncActiveCue(clamped, true);
      playerRef.current?.seekTo(clamped, 'seconds');
    },
    [flushUiTime, syncActiveCue],
  );

  const selectCue = useCallback(
    (index: number, seek: boolean = true) => {
      if (index < 0 || index >= cuesRef.current.length) return;
      setSelectedIndex(index);
      if (seek) {
        seekTo(cuesRef.current[index].startTimeInSeconds + 0.01);
      }
    },
    [seekTo],
  );

  const updateCue = useCallback((index: number, patch: Partial<MergeCue>) => {
    setCues((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      const updated = { ...current, ...patch };
      if (patch.startEndTime) {
        const { start, end } = parseTimeRange(patch.startEndTime);
        updated.startTimeInSeconds = start;
        updated.endTimeInSeconds = end;
      }
      if (
        patch.startTimeInSeconds !== undefined ||
        patch.endTimeInSeconds !== undefined
      ) {
        const start = patch.startTimeInSeconds ?? updated.startTimeInSeconds;
        const end = patch.endTimeInSeconds ?? updated.endTimeInSeconds;
        updated.startTimeInSeconds = start;
        updated.endTimeInSeconds = end;
        updated.startEndTime = `${secondsToTime(start)} --> ${secondsToTime(end)}`;
      }
      next[index] = updated;
      cuesRef.current = next;

      if (index === activeIndexRef.current) {
        setPreviewText(
          wrapSubtitleTextForPreview(
            updated.text,
            styleRef.current,
            videoWidthRef.current,
          ),
        );
      }

      return next;
    });
    setIsDirty(true);
  }, []);

  const updateCueText = useCallback(
    (index: number, text: string) => {
      updateCue(index, { text });
    },
    [updateCue],
  );

  const addCueAtCurrentTime = useCallback(() => {
    const start = currentTimeRef.current;
    const end = Math.min(start + 2, duration || start + 2);
    const nextId = String(
      cuesRef.current.reduce(
        (max, cue) => Math.max(max, Number(cue.id) || 0),
        0,
      ) + 1,
    );
    const newCue: MergeCue = {
      id: nextId,
      startEndTime: `${secondsToTime(start)} --> ${secondsToTime(end)}`,
      text: '',
      startTimeInSeconds: start,
      endTimeInSeconds: end,
    };
    setCues((prev) => {
      const next = [...prev, newCue].sort(
        (a, b) => a.startTimeInSeconds - b.startTimeInSeconds,
      );
      cuesRef.current = next;
      const newIndex = next.findIndex((cue) => cue.id === nextId);
      setSelectedIndex(newIndex);
      return next;
    });
    setIsDirty(true);
  }, [duration]);

  const deleteSelectedCue = useCallback(() => {
    setSelectedIndex((selected) => {
      if (selected < 0) return selected;
      setCues((prev) => {
        const next = prev.filter((_, i) => i !== selected);
        cuesRef.current = next;
        return next;
      });
      setIsDirty(true);
      return -1;
    });
  }, []);

  const saveCues = useCallback(async (): Promise<boolean> => {
    if (!subtitlePath) return false;
    try {
      await window.ipc.invoke('saveSubtitleFile', {
        filePath: subtitlePath,
        subtitles: cuesRef.current.map(mapCueToSubtitle),
      });
      setIsDirty(false);
      toast.success(t('saveCuesSuccess'));
      return true;
    } catch {
      toast.error(t('saveCuesError'));
      return false;
    }
  }, [subtitlePath, t]);

  const handleProgress = useCallback(
    ({ playedSeconds }: { playedSeconds: number }) => {
      currentTimeRef.current = playedSeconds;

      const now = performance.now();
      if (
        now - lastUiSyncRef.current >= UI_TIME_THROTTLE_MS ||
        !isPlayingRef.current
      ) {
        setUiCurrentTime(playedSeconds);
        lastUiSyncRef.current = now;
      }

      syncActiveCue(playedSeconds);
    },
    [syncActiveCue],
  );

  const handleDuration = useCallback((value: number) => {
    setDuration(value);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSeek = useCallback(
    (time: number) => {
      seekTo(time);
    },
    [seekTo],
  );

  return {
    playerRef,
    cues,
    selectedIndex,
    activeIndex,
    previewText,
    currentTime: uiCurrentTime,
    duration,
    isPlaying,
    isDirty,
    setIsPlaying,
    handleProgress,
    handleDuration,
    togglePlay,
    handleSeek,
    seekTo,
    selectCue,
    updateCue,
    updateCueText,
    addCueAtCurrentTime,
    deleteSelectedCue,
    saveCues,
  };
}
