import React from 'react';
import { useTranslation } from 'next-i18next';
import { Progress } from '@/components/ui/progress';

interface FfmpegHelperProgressDisplayProps {
  value: number;
}

export function FfmpegHelperProgressDisplay({
  value,
}: FfmpegHelperProgressDisplayProps) {
  const { t } = useTranslation('ffmpegHelper');
  const safeValue = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {t('progressLabel')}
        </span>
        <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
          {t('progressPercent', { percent: safeValue })}
        </span>
      </div>
      <Progress value={safeValue} className="h-2" />
    </div>
  );
}

export function processingButtonLabel(
  processing: boolean,
  progress: number,
  idleLabel: string,
  processingLabel: string,
): string {
  if (!processing) {
    return idleLabel;
  }
  const safeValue = Math.min(100, Math.max(0, Math.round(progress)));
  return `${processingLabel} (${safeValue}%)`;
}
