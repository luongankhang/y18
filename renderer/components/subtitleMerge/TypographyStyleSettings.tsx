/**
 * 深度排版样式设置
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { SubtitleStyle, WrapStyle } from '../../../types/subtitleMerge';
import {
  SCALE_RANGE,
  LETTER_SPACING_RANGE,
  ANGLE_RANGE,
  LINE_HEIGHT_RANGE,
  ALPHA_RANGE,
  WRAP_STYLE_OPTIONS,
} from './constants';

interface TypographyStyleSettingsProps {
  style: SubtitleStyle;
  onUpdateStyle: (updates: Partial<SubtitleStyle>) => void;
  disabled?: boolean;
}

export default function TypographyStyleSettings({
  style,
  onUpdateStyle,
  disabled = false,
}: TypographyStyleSettingsProps) {
  const { t } = useTranslation('subtitleMerge');
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:bg-muted/50 rounded px-2 -mx-2">
        <span>{t('typographySettings')}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label className="text-sm">{t('secondaryColor')}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={style.secondaryColor}
              onChange={(e) =>
                onUpdateStyle({ secondaryColor: e.target.value })
              }
              disabled={disabled}
              className="w-12 h-9 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={style.secondaryColor}
              onChange={(e) =>
                onUpdateStyle({ secondaryColor: e.target.value })
              }
              disabled={disabled}
              className="flex-1 font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="strikeOut"
              checked={style.strikeOut}
              onCheckedChange={(checked) =>
                onUpdateStyle({ strikeOut: checked })
              }
              disabled={disabled}
            />
            <Label htmlFor="strikeOut" className="text-sm cursor-pointer">
              {t('strikeOut')}
            </Label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t('scaleX')}</Label>
              <span className="text-xs text-muted-foreground">
                {style.scaleX}%
              </span>
            </div>
            <Slider
              value={[style.scaleX]}
              min={SCALE_RANGE.min}
              max={SCALE_RANGE.max}
              step={1}
              onValueChange={([value]) => onUpdateStyle({ scaleX: value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t('scaleY')}</Label>
              <span className="text-xs text-muted-foreground">
                {style.scaleY}%
              </span>
            </div>
            <Slider
              value={[style.scaleY]}
              min={SCALE_RANGE.min}
              max={SCALE_RANGE.max}
              step={1}
              onValueChange={([value]) => onUpdateStyle({ scaleY: value })}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('letterSpacing')}</Label>
            <span className="text-xs text-muted-foreground">
              {style.letterSpacing}px
            </span>
          </div>
          <Slider
            value={[style.letterSpacing]}
            min={LETTER_SPACING_RANGE.min}
            max={LETTER_SPACING_RANGE.max}
            step={0.5}
            onValueChange={([value]) => onUpdateStyle({ letterSpacing: value })}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('angle')}</Label>
            <span className="text-xs text-muted-foreground">
              {style.angle}°
            </span>
          </div>
          <Slider
            value={[style.angle]}
            min={ANGLE_RANGE.min}
            max={ANGLE_RANGE.max}
            step={1}
            onValueChange={([value]) => onUpdateStyle({ angle: value })}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('lineHeight')}</Label>
            <span className="text-xs text-muted-foreground">
              {style.lineHeight.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[style.lineHeight]}
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={LINE_HEIGHT_RANGE.step}
            onValueChange={([value]) => onUpdateStyle({ lineHeight: value })}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">{t('wrapStyle')}</Label>
          <Select
            value={String(style.wrapStyle)}
            onValueChange={(value) =>
              onUpdateStyle({ wrapStyle: Number(value) as WrapStyle })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WRAP_STYLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label className="text-sm">{t('colorAlpha')}</Label>
          {(
            [
              { key: 'primaryAlpha' as const, label: t('primaryAlpha') },
              { key: 'outlineAlpha' as const, label: t('outlineAlpha') },
              { key: 'backAlpha' as const, label: t('backAlpha') },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {style[key]}
                </span>
              </div>
              <Slider
                value={[style[key]]}
                min={ALPHA_RANGE.min}
                max={ALPHA_RANGE.max}
                step={1}
                onValueChange={([value]) => onUpdateStyle({ [key]: value })}
                disabled={disabled}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t('alphaHint')}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
