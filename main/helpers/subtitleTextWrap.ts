import type { SubtitleStyle } from '../../types/subtitleMerge';

export function estimateMaxCharsPerLine(
  videoWidth: number,
  style: Pick<SubtitleStyle, 'fontSize' | 'marginL' | 'marginR'>,
): number {
  const availableWidth = Math.max(
    40,
    videoWidth - style.marginL - style.marginR,
  );
  const charWidth = style.fontSize * 0.55;
  return Math.max(8, Math.floor(availableWidth / charWidth));
}

export function wrapTextAtWordBoundaries(
  text: string,
  maxCharsPerLine: number,
): string {
  if (!text.trim()) {
    return text;
  }

  return text
    .split('\n')
    .map((paragraph) => wrapSingleParagraph(paragraph, maxCharsPerLine))
    .join('\n');
}

function wrapSingleParagraph(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return text;
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word);
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join('\n');
}

export function wrapSubtitleTextForVideo(
  text: string,
  style: Pick<SubtitleStyle, 'fontSize' | 'marginL' | 'marginR'>,
  videoWidth: number,
): string {
  const maxChars = estimateMaxCharsPerLine(videoWidth, style);
  return wrapTextAtWordBoundaries(text, maxChars);
}
