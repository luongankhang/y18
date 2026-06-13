/**
 * 紧凑字幕 cue 列表（快速编辑）
 */

import React, { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { Button } from '@/components/ui/button';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { MergeCue } from '../../../types/subtitleMerge';
import CueListItem from './CueListItem';

interface SubtitleCueListProps {
  cues: MergeCue[];
  selectedIndex: number;
  activeIndex: number;
  isDirty: boolean;
  isPlaying?: boolean;
  disabled?: boolean;
  onSelectCue: (index: number) => void;
  onUpdateCueText: (index: number, text: string) => void;
  onUpdateCueTime: (
    index: number,
    field: 'start' | 'end',
    value: string,
  ) => void;
  onAddCue: () => void;
  onDeleteCue: () => void;
  onSave: () => void;
}

function SubtitleCueList({
  cues,
  selectedIndex,
  activeIndex,
  isDirty,
  isPlaying = false,
  disabled = false,
  onSelectCue,
  onUpdateCueText,
  onUpdateCueTime,
  onAddCue,
  onDeleteCue,
  onSave,
}: SubtitleCueListProps) {
  const { t } = useTranslation('subtitleMerge');
  const listRef = useRef<HTMLDivElement>(null);
  const lastScrolledActiveRef = useRef(-1);

  useEffect(() => {
    if (
      isPlaying ||
      activeIndex < 0 ||
      activeIndex === lastScrolledActiveRef.current
    ) {
      return;
    }
    const container = listRef.current;
    if (!container) return;
    const row = container.querySelector<HTMLElement>(
      `[data-cue-index="${activeIndex}"]`,
    );
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      lastScrolledActiveRef.current = activeIndex;
    }
  }, [activeIndex, isPlaying]);

  useEffect(() => {
    if (selectedIndex >= 0 && !isPlaying) {
      lastScrolledActiveRef.current = -1;
    }
  }, [selectedIndex, isPlaying]);

  if (cues.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        {t('noCuesLoaded')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onAddCue}
          disabled={disabled}
        >
          <Plus className="w-3 h-3 mr-1" />
          {t('addCue')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onDeleteCue}
          disabled={disabled || selectedIndex < 0}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          {t('deleteCue')}
        </Button>
        <Button
          variant={isDirty ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs ml-auto"
          onClick={onSave}
          disabled={disabled || !isDirty}
        >
          <Save className="w-3 h-3 mr-1" />
          {t('saveCues')}
        </Button>
      </div>

      <div
        ref={listRef}
        className="max-h-44 overflow-y-auto rounded-md border divide-y"
      >
        {cues.map((cue, index) => (
          <div key={cue.id} data-cue-index={index}>
            <CueListItem
              cue={cue}
              index={index}
              isSelected={index === selectedIndex}
              isActive={index === activeIndex}
              disabled={disabled}
              onSelect={onSelectCue}
              onCommitText={onUpdateCueText}
              onCommitTime={onUpdateCueTime}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(SubtitleCueList);
