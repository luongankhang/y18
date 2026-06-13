import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'next-i18next';
import {
  Mail,
  Terminal,
  Cpu,
  Code2,
  ExternalLink,
  Facebook,
} from 'lucide-react';
import { cn } from 'lib/utils';
import packageInfo from '../../package.json';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appMode?: 'dev' | 'release' | null;
}

function MacTrafficLights({ onClose }: { onClose: () => void }) {
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

export function AboutDialog({ open, onOpenChange, appMode }: AboutDialogProps) {
  const { t } = useTranslation('common');
  const email = 'com.email.luongankhangfe90@gmail.com';

  const cppStack = [
    t('about.cppStack1'),
    t('about.cppStack2'),
    t('about.cppStack3'),
    t('about.cppStack4'),
    t('about.cppStack5'),
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2',
            'flex max-h-[90vh] flex-col',
            'overflow-hidden rounded-xl border border-black/10 bg-[#f5f5f7] shadow-2xl',
            'dark:border-white/10 dark:bg-[#1e1e1e]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* macOS title bar — cố định, không cuộn */}
          <div className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-[#ececec] px-4 py-3 dark:border-white/5 dark:bg-[#323232]">
            <MacTrafficLights onClose={() => onOpenChange(false)} />
            <DialogPrimitive.Title className="flex-1 text-center text-xs font-medium text-[#3c3c3c] dark:text-[#d4d4d4]">
              {t('about.windowTitle')}
            </DialogPrimitive.Title>
            <div className="w-[52px]" aria-hidden />
          </div>

          {/* Vùng cuộn */}
          <div className="overflow-y-auto px-6 pb-6 pt-5 text-center scrollbar-thin scrollbar-track-transparent scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10">
            {/* App icon: nền trắng chữ đen */}
            <div className="mx-auto mb-3 flex h-[72px] w-[72px] items-center justify-center rounded-[18px] border border-black/10 bg-white text-xl font-bold tracking-tight text-black shadow-md">
              y18
            </div>

            <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
              y18
              {appMode === 'dev' && (
                <span className="ml-2 inline-flex rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                  DEV
                </span>
              )}
            </h2>

            <p className="mt-0.5 text-xs text-[#86868b] dark:text-[#98989d]">
              {t('about.version', { version: packageInfo.version })}
            </p>

            <p className="mt-1 text-[11px] text-[#86868b] dark:text-[#98989d]">
              {t('about.tagline')}
            </p>

            {/* ── Developer card ── */}
            <div className="mt-5 rounded-lg border border-black/5 bg-white/80 p-4 text-left dark:border-white/10 dark:bg-[#2a2a2a]">
              {/* Fork author */}
              <p className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
                {t('about.developer')}
              </p>
              <p className="mt-1 text-sm font-medium text-[#1d1d1f] dark:text-white">
                {t('about.devName')}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#515154] dark:text-[#a1a1a6]">
                <Terminal className="h-3.5 w-3.5 shrink-0" />
                {t('about.devRole')}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 text-xs text-[#0066cc] hover:underline dark:text-[#409cff]"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {email}
                </a>
                <a
                  href="https://www.facebook.com/luong.an.khang.9x"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#0066cc] hover:underline dark:text-[#409cff]"
                >
                  <Facebook className="h-3.5 w-3.5 shrink-0" />
                  facebook.com/luong.an.khang.9x
                </a>
              </div>

              {/* Divider */}
              <div className="my-3 border-t border-black/5 dark:border-white/10" />

              {/* Original project: c1 */}
              <p className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
                Original Project
              </p>
              <p className="mt-1 text-sm font-medium text-[#1d1d1f] dark:text-white">
                c1
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#515154] dark:text-[#a1a1a6]">
                <Terminal className="h-3.5 w-3.5 shrink-0" />
                c1
              </p>
              <a
                href="https://github.com/c1/c1"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#0066cc] hover:underline dark:text-[#409cff]"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                github.com/c1/c1
              </a>
            </div>
            {/* ── end Developer card ── */}

            {/* ── Tech stack card ── */}
            <div className="mt-3 rounded-lg border border-black/5 bg-white/80 p-4 text-left dark:border-white/10 dark:bg-[#2a2a2a]">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#86868b]">
                <Code2 className="h-3.5 w-3.5" />
                {t('about.cppSection')}
              </p>
              <ul className="mt-2 space-y-1.5">
                {cppStack.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-[11px] leading-relaxed text-[#515154] dark:text-[#a1a1a6]"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-500" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            {/* ── end Tech stack card ── */}

            {/* ── Disclaimer ── */}
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-black/10 bg-[#fafafa] p-3 text-left dark:border-white/10 dark:bg-[#252525]">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-[#86868b]" />
              <p className="text-[10px] leading-relaxed text-[#86868b] dark:text-[#98989d]">
                {t('about.disclaimer')}
              </p>
            </div>

            <DialogPrimitive.Description asChild>
              <p className="mt-4 text-[10px] text-[#86868b] dark:text-[#636366]">
                {t('about.copyright', { year: new Date().getFullYear() })}
              </p>
            </DialogPrimitive.Description>
          </div>
          {/* ── end scroll area ── */}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
