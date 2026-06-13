import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from 'lib/utils';
import {
  checkVietnameseSpelling,
  SpellIssue,
} from '@/lib/vietnameseSpellCheck';

interface SpellCheckedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onIssuesChange?: (issues: SpellIssue[]) => void;
  enabled?: boolean;
  className?: string;
  rows?: number;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

function renderHighlightedText(text: string, issues: SpellIssue[]) {
  if (issues.length === 0) {
    return text;
  }

  const sorted = [...issues].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((issue, index) => {
    if (issue.start > cursor) {
      parts.push(text.slice(cursor, issue.start));
    }

    parts.push(
      <mark
        key={`${issue.start}-${issue.word}-${index}`}
        className="rounded-sm bg-transparent text-inherit decoration-wavy decoration-red-500 underline underline-offset-[3px]"
        title={
          issue.suggestion ? `${issue.word} → ${issue.suggestion}` : issue.word
        }
      >
        {text.slice(issue.start, issue.end)}
      </mark>,
    );
    cursor = issue.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

export function SpellCheckedTextarea({
  value,
  onChange,
  onIssuesChange,
  enabled = true,
  className,
  rows = 3,
  placeholder,
  onFocus,
  onBlur,
}: SpellCheckedTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<SpellIssue[]>([]);

  useEffect(() => {
    if (!enabled) {
      setIssues([]);
      onIssuesChange?.([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkVietnameseSpelling(value).then((nextIssues) => {
        if (cancelled) return;
        setIssues(nextIssues);
        onIssuesChange?.(nextIssues);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, enabled, onIssuesChange]);

  const highlighted = useMemo(
    () => renderHighlightedText(value || placeholder || '', issues),
    [value, placeholder, issues],
  );

  const syncScroll = () => {
    if (!textareaRef.current || !backdropRef.current) return;
    backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  return (
    <div className="relative w-full">
      <div
        ref={backdropRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm leading-relaxed',
          className,
        )}
      >
        {value ? (
          highlighted
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        {'\n'}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        spellCheck={enabled}
        lang="vi-VN"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          'relative w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-transparent caret-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          className,
        )}
        style={{ WebkitTextFillColor: 'transparent' }}
      />
    </div>
  );
}
