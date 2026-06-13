import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface FfmpegHelperTipProps {
  content: string;
}

export function FfmpegHelperTip({ content }: FfmpegHelperTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-slate-300"
          aria-label={content}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="max-w-xs"
      >
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export const ffmpegHelperCardClass =
  'border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-3xl overflow-visible';

export const ffmpegHelperCardHeaderClass =
  'rounded-t-3xl overflow-hidden border-b border-slate-200/50 dark:border-slate-700/50 py-5';
