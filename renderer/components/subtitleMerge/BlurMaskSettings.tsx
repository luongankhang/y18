/**
 * 模糊遮罩设置组件
 * 用于遮盖视频内嵌原字幕区域
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { SubtitleBlurMask } from '../../../types/subtitleMerge';
import { BLUR_MASK_RANGE } from './constants';

interface BlurMaskSettingsProps {
  blurMask: SubtitleBlurMask;
  onUpdateBlurMask: (updates: Partial<SubtitleBlurMask>) => void;
  disabled?: boolean;
}

export default function BlurMaskSettings({
  blurMask,
  onUpdateBlurMask,
  disabled = false,
}: BlurMaskSettingsProps) {
  const { t } = useTranslation('subtitleMerge');
  const [isOpen, setIsOpen] = React.useState(blurMask.enabled);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:bg-muted/50 rounded px-2 -mx-2">
        <span>{t('blurMaskSettings')}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Switch
            id="blurMaskEnabled"
            checked={blurMask.enabled}
            onCheckedChange={(checked) =>
              onUpdateBlurMask({ enabled: checked })
            }
            disabled={disabled}
          />
          <Label htmlFor="blurMaskEnabled" className="text-sm cursor-pointer">
            {t('blurMaskEnable')}
          </Label>
        </div>

        {blurMask.enabled && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('blurMaskX')}</Label>
                <span className="text-sm text-muted-foreground">
                  {blurMask.xPercent}%
                </span>
              </div>
              <Slider
                value={[blurMask.xPercent]}
                min={BLUR_MASK_RANGE.position.min}
                max={BLUR_MASK_RANGE.position.max}
                step={1}
                onValueChange={([value]) =>
                  onUpdateBlurMask({ xPercent: value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('blurMaskY')}</Label>
                <span className="text-sm text-muted-foreground">
                  {blurMask.yPercent}%
                </span>
              </div>
              <Slider
                value={[blurMask.yPercent]}
                min={BLUR_MASK_RANGE.position.min}
                max={BLUR_MASK_RANGE.position.max}
                step={1}
                onValueChange={([value]) =>
                  onUpdateBlurMask({ yPercent: value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('blurMaskWidth')}</Label>
                <span className="text-sm text-muted-foreground">
                  {blurMask.widthPercent}%
                </span>
              </div>
              <Slider
                value={[blurMask.widthPercent]}
                min={BLUR_MASK_RANGE.size.min}
                max={BLUR_MASK_RANGE.size.max}
                step={1}
                onValueChange={([value]) =>
                  onUpdateBlurMask({ widthPercent: value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('blurMaskHeight')}</Label>
                <span className="text-sm text-muted-foreground">
                  {blurMask.heightPercent}%
                </span>
              </div>
              <Slider
                value={[blurMask.heightPercent]}
                min={BLUR_MASK_RANGE.size.min}
                max={BLUR_MASK_RANGE.size.max}
                step={1}
                onValueChange={([value]) =>
                  onUpdateBlurMask({ heightPercent: value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('blurMaskStrength')}</Label>
                <span className="text-sm text-muted-foreground">
                  {blurMask.strength}
                </span>
              </div>
              <Slider
                value={[blurMask.strength]}
                min={BLUR_MASK_RANGE.strength.min}
                max={BLUR_MASK_RANGE.strength.max}
                step={1}
                onValueChange={([value]) =>
                  onUpdateBlurMask({ strength: value })
                }
                disabled={disabled}
              />
            </div>

            <p className="text-xs text-muted-foreground">{t('blurMaskHint')}</p>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
