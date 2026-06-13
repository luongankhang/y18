import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { OctagonX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface FfmpegHelperCancelProcessingProps {
  processing: boolean;
  progress: number;
  onCancelFailed: () => void;
}

export function FfmpegHelperCancelProcessing({
  processing,
  progress,
  onCancelFailed,
}: FfmpegHelperCancelProcessingProps) {
  const { t } = useTranslation('ffmpegHelper');
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!processing) {
    return null;
  }

  const handleConfirmCancel = async () => {
    try {
      setCancelling(true);
      await window?.ipc?.invoke('ffmpeg-cancel-task');
      setOpen(false);
    } catch {
      onCancelFailed();
    } finally {
      setCancelling(false);
    }
  };

  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-3 rounded-2xl border border-red-200/70 bg-white/95 p-4 shadow-2xl shadow-red-500/10 backdrop-blur-xl dark:border-red-900/50 dark:bg-slate-900/95 dark:shadow-red-900/20">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('processing')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('progressPercent', { percent: safeProgress })}
        </p>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            className="w-full rounded-xl shadow-lg shadow-red-500/20"
            disabled={cancelling}
          >
            <OctagonX className="mr-2 h-4 w-4" />
            {t('cancelProcessing')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancelProcessingTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cancelProcessingDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t('keepProcessing')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmCancel();
              }}
            >
              {t('confirmCancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
