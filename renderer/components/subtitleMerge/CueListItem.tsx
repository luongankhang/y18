/**
 * 单条字幕 cue 行（本地编辑，避免每次按键触发整表重渲染）
 */

import React, { memo, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MergeCue } from '../../../types/subtitleMerge';
import { formatTimeShort } from './utils/timeUtils';

interface CueListItemProps {
  cue: MergeCue;
  index: number;
  isSelected: boolean;
  isActive: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
  onCommitText: (index: number, text: string) => void;
  onCommitTime: (index: number, field: 'start' | 'end', value: string) => void;
}

const CueListItem = memo(
  function CueListItem({
    cue,
    index,
    isSelected,
    isActive,
    disabled,
    onSelect,
    onCommitText,
    onCommitTime,
  }: CueListItemProps) {
    const [text, setText] = useState(cue.text);

    useEffect(() => {
      setText(cue.text);
    }, [cue.id, cue.text]);

    return (
      <div
        className={`p-2 space-y-1 cursor-pointer ${
          isSelected
            ? 'bg-primary/10'
            : isActive
              ? 'bg-muted/70'
              : 'hover:bg-muted/40'
        }`}
        onClick={() => onSelect(index)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-5">
            #{cue.id}
          </span>
          <Input
            defaultValue={formatTimeShort(cue.startTimeInSeconds)}
            key={`start-${cue.id}-${cue.startTimeInSeconds}`}
            onBlur={(e) => onCommitTime(index, 'start', e.target.value)}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled}
            className="h-6 text-[10px] font-mono px-1 w-14"
          />
          <span className="text-[10px] text-muted-foreground">→</span>
          <Input
            defaultValue={formatTimeShort(cue.endTimeInSeconds)}
            key={`end-${cue.id}-${cue.endTimeInSeconds}`}
            onBlur={(e) => onCommitTime(index, 'end', e.target.value)}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled}
            className="h-6 text-[10px] font-mono px-1 w-14"
          />
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== cue.text) {
              onCommitText(index, text);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          rows={2}
          className="text-xs min-h-[44px] resize-none"
        />
      </div>
    );
  },
  (prev, next) =>
    prev.index === next.index &&
    prev.isSelected === next.isSelected &&
    prev.isActive === next.isActive &&
    prev.disabled === next.disabled &&
    prev.cue.id === next.cue.id &&
    prev.cue.text === next.cue.text &&
    prev.cue.startTimeInSeconds === next.cue.startTimeInSeconds &&
    prev.cue.endTimeInSeconds === next.cue.endTimeInSeconds,
);

export default CueListItem;
