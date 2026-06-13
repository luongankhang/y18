import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { MacWindowDialog } from './MacWindowDialog';

interface MacConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  confirmVariant?: 'default' | 'destructive';
}

export function MacConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirmVariant = 'default',
}: MacConfirmDialogProps) {
  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  return (
    <MacWindowDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidthClass="max-w-[360px]"
      description={
        <DialogPrimitive.Description asChild>
          <p className="sr-only">{message}</p>
        </DialogPrimitive.Description>
      }
    >
      <div className="px-6 pb-6 pt-5 text-center">
        <p className="text-sm leading-relaxed text-[#515154] dark:text-[#a1a1a6]">
          {message}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-black/10 bg-white/80 dark:border-white/10 dark:bg-[#2a2a2a]"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            className={
              confirmVariant === 'destructive'
                ? 'rounded-xl shadow-lg shadow-red-500/20'
                : 'rounded-xl'
            }
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </MacWindowDialog>
  );
}
