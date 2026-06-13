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
import { MacWindowDialog } from './MacWindowDialog';
import packageInfo from '../../package.json';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appMode?: 'dev' | 'release' | null;
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
    <MacWindowDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('about.windowTitle')}
    >
      <div className="overflow-y-auto px-6 pb-6 pt-5 text-center scrollbar-thin scrollbar-track-transparent scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10">
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

        <div className="mt-5 rounded-lg border border-black/5 bg-white/80 p-4 text-left dark:border-white/10 dark:bg-[#2a2a2a]">
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

          <div className="my-3 border-t border-black/5 dark:border-white/10" />

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
    </MacWindowDialog>
  );
}
