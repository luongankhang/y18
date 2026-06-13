import React from 'react';
import { useTranslation } from 'next-i18next';
import { FileOutput } from 'lucide-react';
import type { OutputPathPreviewData } from './useOutputPathPreview';

interface OutputPathPreviewProps {
  preview: OutputPathPreviewData | null;
}

export function OutputPathPreview({ preview }: OutputPathPreviewProps) {
  const { t } = useTranslation('ffmpegHelper');

  if (!preview) {
    return null;
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="flex items-start gap-2">
        <FileOutput className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t('outputPreview')}
          </p>
          <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-200">
            {preview.fullPath}
          </p>
          {preview.duplicateIndex > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {t('outputPreviewDuplicate', { n: preview.duplicateIndex })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
