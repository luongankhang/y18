import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectTrigger } from '@/components/ui/select';
import {
  DescribedSelectItem,
  FfmpegSelectTriggerValue,
} from './FfmpegOptionSelect';

const SPEED_MIN = 0.5;
const SPEED_MAX = 2.0;
const SPEED_STEP = 0.1;

export const SPEED_TIERS = Array.from(
  { length: Math.round((SPEED_MAX - SPEED_MIN) / SPEED_STEP) + 1 },
  (_, i) => (SPEED_MIN + i * SPEED_STEP).toFixed(1),
);

export function combineSpeed(tier: string, fine: string): string {
  const speed = parseFloat(tier) + parseInt(fine, 10) / 100;
  return Math.min(SPEED_MAX, speed).toFixed(2);
}

export function getFineOptions(tier: string): string[] {
  if (parseFloat(tier) >= SPEED_MAX) {
    return ['0'];
  }
  return Array.from({ length: 10 }, (_, i) => String(i));
}

interface SpeedSelectorProps {
  tier: string;
  fine: string;
  onTierChange: (tier: string) => void;
  onFineChange: (fine: string) => void;
  disabled?: boolean;
}

export function SpeedSelector({
  tier,
  fine,
  onTierChange,
  onFineChange,
  disabled = false,
}: SpeedSelectorProps) {
  const { t } = useTranslation('ffmpegHelper');

  const fineOptions = useMemo(() => getFineOptions(tier), [tier]);
  const combinedSpeed = useMemo(() => combineSpeed(tier, fine), [tier, fine]);

  const handleTierChange = (value: string) => {
    onTierChange(value);
    if (parseFloat(value) >= SPEED_MAX) {
      onFineChange('0');
    }
  };

  const selectTriggerClass =
    'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-blue-500/20';
  const selectContentClass =
    'bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-xl max-h-64';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('speedPreset')}
          </Label>
          <Select
            value={tier}
            onValueChange={handleTierChange}
            disabled={disabled}
          >
            <SelectTrigger className={selectTriggerClass}>
              <FfmpegSelectTriggerValue
                name={`${parseFloat(tier).toFixed(1)}x`}
              />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {SPEED_TIERS.map((value) => {
                const label = `${parseFloat(value).toFixed(1)}x`;
                return (
                  <DescribedSelectItem
                    key={value}
                    value={value}
                    name={label}
                    description={t('speedTierDesc', {
                      speed: parseFloat(value).toFixed(1),
                    })}
                  />
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:pl-1">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('speedFine')}
          </Label>
          <Select value={fine} onValueChange={onFineChange} disabled={disabled}>
            <SelectTrigger className={selectTriggerClass}>
              <FfmpegSelectTriggerValue name={`${combineSpeed(tier, fine)}x`} />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {fineOptions.map((option) => {
                const label = combineSpeed(tier, option);
                return (
                  <DescribedSelectItem
                    key={option}
                    value={option}
                    name={`${label}x`}
                    description={t('speedFineDesc', { speed: label })}
                  />
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('speedSelected', { speed: combinedSpeed })}
      </p>
    </div>
  );
}
