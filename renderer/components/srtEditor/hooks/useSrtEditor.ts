import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'next-i18next';
import {
  checkVietnameseSpelling,
  countSpellIssuesInCues,
  SpellIssue,
} from '@/lib/vietnameseSpellCheck';

export interface SrtCue {
  id: string;
  startEndTime: string;
  text: string;
  startTimeInSeconds: number;
  endTimeInSeconds: number;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.replace(',', '.').split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(3);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(6, '0').replace('.', ',')}`;
}

function parseTimeRange(timeRange: string): { start: number; end: number } {
  const times = timeRange.split(' --> ');
  if (times.length !== 2) return { start: 0, end: 0 };
  return {
    start: timeToSeconds(times[0].trim()),
    end: timeToSeconds(times[1].trim()),
  };
}

function mapSubtitleToCue(subtitle: {
  id: string;
  startEndTime: string;
  sourceContent?: string;
  content?: string[];
  startTimeInSeconds?: number;
  endTimeInSeconds?: number;
}): SrtCue {
  const { start, end } = parseTimeRange(subtitle.startEndTime);
  return {
    id: subtitle.id,
    startEndTime: subtitle.startEndTime,
    text: subtitle.sourceContent || subtitle.content?.join('\n') || '',
    startTimeInSeconds: subtitle.startTimeInSeconds ?? start,
    endTimeInSeconds: subtitle.endTimeInSeconds ?? end,
  };
}

function mapCueToSubtitle(cue: SrtCue) {
  return {
    id: cue.id,
    startEndTime: cue.startEndTime,
    content: cue.text.split('\n'),
    sourceContent: cue.text,
    startTimeInSeconds: cue.startTimeInSeconds,
    endTimeInSeconds: cue.endTimeInSeconds,
  };
}

export function useSrtEditor() {
  const { t } = useTranslation('srtEditor');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [cues, setCues] = useState<SrtCue[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [spellIssuesByCue, setSpellIssuesByCue] = useState<SpellIssue[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [timeShiftMs, setTimeShiftMs] = useState('0');

  const totalSpellIssues = useMemo(
    () => countSpellIssuesInCues(spellIssuesByCue),
    [spellIssuesByCue],
  );

  const overlapIssues = useMemo(() => {
    const issues: number[] = [];
    for (let i = 0; i < cues.length - 1; i += 1) {
      if (cues[i].endTimeInSeconds > cues[i + 1].startTimeInSeconds) {
        issues.push(i);
      }
    }
    return issues;
  }, [cues]);

  const refreshSpellIssues = useCallback(
    async (nextCues: SrtCue[]) => {
      if (!spellCheckEnabled) {
        setSpellIssuesByCue(nextCues.map(() => []));
        return;
      }
      const results = await Promise.all(
        nextCues.map((cue) => checkVietnameseSpelling(cue.text)),
      );
      setSpellIssuesByCue(results);
    },
    [spellCheckEnabled],
  );

  useEffect(() => {
    void refreshSpellIssues(cues);
  }, [cues, refreshSpellIssues]);

  const loadFromPath = useCallback(
    async (path: string) => {
      setIsLoading(true);
      try {
        const subtitles = await window.ipc.invoke('readSubtitleFile', {
          filePath: path,
        });
        const nextCues = (subtitles || []).map(mapSubtitleToCue);
        setCues(nextCues);
        setFilePath(path);
        setFileName(path.split(/[/\\]/).pop() || path);
        setCurrentIndex(0);
        setIsDirty(false);
        toast.success(t('loadSuccess'));
      } catch {
        toast.error(t('loadError'));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const openFile = useCallback(async () => {
    const result = await window.ipc.invoke('selectFile', {
      type: 'subtitle',
      title: t('openFile'),
    });
    if (!result?.canceled && result?.filePath) {
      await loadFromPath(result.filePath);
    }
  }, [loadFromPath, t]);

  const saveFile = useCallback(
    async (targetPath?: string) => {
      const savePath = targetPath || filePath;
      if (!savePath) {
        toast.error(t('noFileOpen'));
        return false;
      }

      try {
        await window.ipc.invoke('saveSubtitleFile', {
          filePath: savePath,
          subtitles: cues.map(mapCueToSubtitle),
        });
        setFilePath(savePath);
        setFileName(savePath.split(/[/\\]/).pop() || savePath);
        setIsDirty(false);
        toast.success(t('saveSuccess'));
        return true;
      } catch {
        toast.error(t('saveError'));
        return false;
      }
    },
    [cues, filePath, t],
  );

  const saveFileAs = useCallback(async () => {
    const result = await window.ipc.invoke('selectSaveSubtitlePath', {
      defaultPath: fileName || 'subtitle.srt',
      title: t('saveAs'),
    });
    if (!result?.canceled && result?.filePath) {
      return saveFile(result.filePath);
    }
    return false;
  }, [fileName, saveFile, t]);

  const updateCue = useCallback((index: number, patch: Partial<SrtCue>) => {
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
      next[index] = updated;
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

  const updateCueIssues = useCallback((index: number, issues: SpellIssue[]) => {
    setSpellIssuesByCue((prev) => {
      const next = [...prev];
      next[index] = issues;
      return next;
    });
  }, []);

  const addCue = useCallback(() => {
    setCues((prev) => {
      const last = prev[prev.length - 1];
      const start = last ? last.endTimeInSeconds + 0.5 : 0;
      const end = start + 2;
      const nextCue: SrtCue = {
        id: String(prev.length + 1),
        startEndTime: `${secondsToTime(start)} --> ${secondsToTime(end)}`,
        text: '',
        startTimeInSeconds: start,
        endTimeInSeconds: end,
      };
      return [...prev, nextCue];
    });
    setIsDirty(true);
  }, []);

  const deleteCue = useCallback(
    (index: number) => {
      setCues((prev) => {
        const next = prev.filter((_, i) => i !== index);
        return next.map((cue, idx) => ({ ...cue, id: String(idx + 1) }));
      });
      setCurrentIndex((prev) => Math.max(0, Math.min(prev, cues.length - 2)));
      setIsDirty(true);
    },
    [cues.length],
  );

  const shiftAllTimes = useCallback(() => {
    const offsetSec = Number(timeShiftMs) / 1000;
    if (Number.isNaN(offsetSec) || offsetSec === 0) return;

    setCues((prev) =>
      prev.map((cue) => {
        const start = Math.max(0, cue.startTimeInSeconds + offsetSec);
        const end = Math.max(start + 0.05, cue.endTimeInSeconds + offsetSec);
        return {
          ...cue,
          startTimeInSeconds: start,
          endTimeInSeconds: end,
          startEndTime: `${secondsToTime(start)} --> ${secondsToTime(end)}`,
        };
      }),
    );
    setIsDirty(true);
    toast.success(t('shiftApplied'));
  }, [timeShiftMs, t]);

  const goToNextSpellIssue = useCallback(() => {
    for (let i = currentIndex; i < spellIssuesByCue.length; i += 1) {
      if (spellIssuesByCue[i]?.length) {
        setCurrentIndex(i);
        return;
      }
    }
    for (let i = 0; i < currentIndex; i += 1) {
      if (spellIssuesByCue[i]?.length) {
        setCurrentIndex(i);
        return;
      }
    }
  }, [currentIndex, spellIssuesByCue]);

  return {
    filePath,
    fileName,
    cues,
    currentIndex,
    setCurrentIndex,
    spellCheckEnabled,
    setSpellCheckEnabled,
    spellIssuesByCue,
    totalSpellIssues,
    overlapIssues,
    isLoading,
    isDirty,
    timeShiftMs,
    setTimeShiftMs,
    openFile,
    loadFromPath,
    saveFile,
    saveFileAs,
    updateCue,
    updateCueText,
    updateCueIssues,
    addCue,
    deleteCue,
    shiftAllTimes,
    goToNextSpellIssue,
  };
}
