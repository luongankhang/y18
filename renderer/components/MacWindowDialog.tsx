import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from 'lib/utils';

interface MacWindowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
  description?: React.ReactNode;
}

export function MacTrafficLights({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="group relative h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform hover:scale-105"
      >
        <span className="absolute inset-0 m-auto hidden h-2 w-2 text-[8px] font-bold leading-none text-[#4d0000] group-hover:block">
          ×
        </span>
      </button>
      <button
        type="button"
        aria-label="Minimize"
        className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform hover:scale-105"
      />
      <button
        type="button"
        aria-label="Zoom"
        className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform hover:scale-105"
      />
    </div>
  );
}

export function MacWindowDialog({
  open,
  onOpenChange,
  title,
  children,
  maxWidthClass = 'max-w-[420px]',
  description,
}: MacWindowDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
            maxWidthClass,
            'flex max-h-[90vh] flex-col',
            'overflow-hidden rounded-xl border border-black/10 bg-[#f5f5f7] shadow-2xl',
            'dark:border-white/10 dark:bg-[#1e1e1e]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-[#ececec] px-4 py-3 dark:border-white/5 dark:bg-[#323232]">
            <MacTrafficLights onClose={() => onOpenChange(false)} />
            <DialogPrimitive.Title className="flex-1 text-center text-xs font-medium text-[#3c3c3c] dark:text-[#d4d4d4]">
              {title}
            </DialogPrimitive.Title>
            <div className="w-[52px]" aria-hidden />
          </div>
          {description}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
