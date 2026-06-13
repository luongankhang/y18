import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from 'lib/utils';

interface AdvancedOptionsSectionProps {
  children: React.ReactNode;
  disabled?: boolean;
  accentClass?: string;
}

export function AdvancedOptionsSection({
  children,
  disabled = false,
  accentClass = 'border-slate-200/60 dark:border-slate-700/60',
}: AdvancedOptionsSectionProps) {
  const { t } = useTranslation('ffmpegHelper');
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-between rounded-xl border bg-slate-50/50 px-4 py-3 font-medium dark:bg-slate-900/30',
            accentClass,
          )}
        >
          <span className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4" />
            {t('advancedOptions')}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export const advancedSelectTriggerClass =
  'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl h-10';

export const advancedSelectContentClass =
  'bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-xl';

export function AdvancedFieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
