import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'next-i18next';
import { Button } from '@/components/ui/button';
import { MacWindowDialog } from './MacWindowDialog';

interface QuitConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuitConfirmDialog({
  open,
  onOpenChange,
}: QuitConfirmDialogProps) {
  const { t } = useTranslation('common');

  const handleDismiss = () => {
    window?.ipc?.send('cancel-app-quit', null);
    onOpenChange(false);
  };

  const handleConfirmQuit = () => {
    onOpenChange(false);
    window?.ipc?.send('confirm-app-quit', null);
  };

  return (
    <MacWindowDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleDismiss();
          return;
        }
        onOpenChange(true);
      }}
      title={t('quit.windowTitle')}
      maxWidthClass="max-w-[360px]"
      description={
        <DialogPrimitive.Description asChild>
          <p className="sr-only">{t('quit.message')}</p>
        </DialogPrimitive.Description>
      }
    >
      <div className="px-6 pb-6 pt-5 text-center">
        <p className="text-sm leading-relaxed text-[#515154] dark:text-[#a1a1a6]">
          {t('quit.message')}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-black/10 bg-white/80 dark:border-white/10 dark:bg-[#2a2a2a]"
            onClick={handleDismiss}
          >
            {t('quit.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-xl shadow-lg shadow-red-500/20"
            onClick={handleConfirmQuit}
          >
            {t('quit.confirm')}
          </Button>
        </div>
      </div>
    </MacWindowDialog>
  );
}
