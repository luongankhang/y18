/**
 * 字幕预览实时加载 Hook
 * 按播放时间显示当前字幕 cue
 */

import { useCallback, useEffect, useState } from 'react';
import type { SubtitleStyle } from '../../../../types/subtitleMerge';
import { wrapSubtitleTextForPreview } from '../../../lib/subtitleTextWrap';

interface PreviewCue {
  start: number;
  end: number;
  text: string;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.replace(',', '.').split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseTimeRange(timeRange: string): { start: number; end: number } {
  const times = timeRange.split(' --> ');
  if (times.length !== 2) return { start: 0, end: 0 };
  return {
    start: timeToSeconds(times[0].trim()),
    end: timeToSeconds(times[1].trim()),
  };
}

export function useSubtitlePreview(
  subtitlePath: string | null,
  style: SubtitleStyle,
  videoWidth: number | null | undefined,
) {
  const [cues, setCues] = useState<PreviewCue[]>([]);

  useEffect(() => {
    if (!subtitlePath) {
      setCues([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const entries: Array<{
          startEndTime: string;
          content?: string[];
        }> = await window.ipc.invoke('readSubtitleFile', {
          filePath: subtitlePath,
        });

        if (cancelled) return;

        const parsed = (entries || []).map((entry) => {
          const { start, end } = parseTimeRange(entry.startEndTime);
          const rawText = (entry.content || []).join('\n');
          const text = wrapSubtitleTextForPreview(rawText, style, videoWidth);
          return { start, end, text };
        });

        setCues(parsed);
      } catch (error) {
        console.error('加载预览字幕失败:', error);
        if (!cancelled) setCues([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subtitlePath, style.fontSize, style.marginL, style.marginR, videoWidth]);

  const getActiveText = useCallback(
    (currentTime: number): string => {
      const cue = cues.find(
        (item) => currentTime >= item.start && currentTime < item.end,
      );
      return cue?.text ?? '';
    },
    [cues],
  );

  return { getActiveText, cues };
}
