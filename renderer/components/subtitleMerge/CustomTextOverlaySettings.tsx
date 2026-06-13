/**
 * 自定义文字叠加设置（频道名、水印等，与字幕无关）
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
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
import type {
  BorderStyle,
  CustomTextOverlay,
} from '../../../types/subtitleMerge';
import {
  CUSTOM_POS_RANGE,
  FONT_LIST,
  FONT_SIZE_RANGE,
  OUTLINE_RANGE,
  SHADOW_RANGE,
  MARGIN_RANGE,
  BORDER_STYLE_OPTIONS,
  SCALE_RANGE,
  LETTER_SPACING_RANGE,
  ANGLE_RANGE,
} from './constants';
import AlignmentSelector from './AlignmentSelector';
import { getOverlayPositionForAlignment } from './utils/styleUtils';

interface CustomTextOverlaySettingsProps {
  overlay: CustomTextOverlay;
  onUpdateOverlay: (updates: Partial<CustomTextOverlay>) => void;
  videoWidth?: number;
  videoHeight?: number;
  disabled?: boolean;
}

export default function CustomTextOverlaySettings({
  overlay,
  onUpdateOverlay,
  videoWidth = 1920,
  videoHeight = 1080,
  disabled = false,
}: CustomTextOverlaySettingsProps) {
  const { t } = useTranslation(['subtitleMerge', 'common']);
  const [isOpen, setIsOpen] = React.useState(overlay.enabled);
  const [styleOpen, setStyleOpen] = React.useState(false);

  const handleAlignmentChange = (alignment: CustomTextOverlay['alignment']) => {
    const pos = getOverlayPositionForAlignment(
      alignment,
      overlay.marginL,
      overlay.marginR,
      overlay.marginV,
      videoWidth,
      videoHeight,
    );
    onUpdateOverlay({ alignment, ...pos });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:bg-muted/50 rounded px-2 -mx-2">
        <span>{t('customTextOverlaySettings')}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Switch
            id="customTextOverlay"
            checked={overlay.enabled}
            onCheckedChange={(checked) => onUpdateOverlay({ enabled: checked })}
            disabled={disabled}
          />
          <Label htmlFor="customTextOverlay" className="text-sm cursor-pointer">
            {t('customTextOverlayEnable')}
          </Label>
        </div>

        {overlay.enabled && (
          <>
            <div className="space-y-2">
              <Label className="text-sm">{t('customTextOverlayContent')}</Label>
              <Input
                value={overlay.text}
                onChange={(e) => onUpdateOverlay({ text: e.target.value })}
                disabled={disabled}
                placeholder={t('customTextOverlayPlaceholder')}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t('customTextOverlayHint')}
              </p>
            </div>

            {/* 字体 */}
            <div className="space-y-2">
              <Label className="text-sm">{t('fontFamily')}</Label>
              <Select
                value={overlay.fontName}
                onValueChange={(value) => onUpdateOverlay({ fontName: value })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectFont')} />
                </SelectTrigger>
                <SelectContent>
                  {FONT_LIST.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      <span style={{ fontFamily: font.value }}>
                        {t(`common:fonts.${font.value}`, {
                          defaultValue: font.label,
                        })}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('fontSize')}</Label>
                <span className="text-xs text-muted-foreground">
                  {overlay.fontSize}px
                </span>
              </div>
              <Slider
                value={[overlay.fontSize]}
                min={FONT_SIZE_RANGE.min}
                max={FONT_SIZE_RANGE.max}
                step={1}
                onValueChange={([value]) =>
                  onUpdateOverlay({ fontSize: value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('fontColor')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={overlay.primaryColor}
                  onChange={(e) =>
                    onUpdateOverlay({ primaryColor: e.target.value })
                  }
                  disabled={disabled}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={overlay.primaryColor}
                  onChange={(e) =>
                    onUpdateOverlay({ primaryColor: e.target.value })
                  }
                  disabled={disabled}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('outlineColor')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={overlay.outlineColor}
                  onChange={(e) =>
                    onUpdateOverlay({ outlineColor: e.target.value })
                  }
                  disabled={disabled}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={overlay.outlineColor}
                  onChange={(e) =>
                    onUpdateOverlay({ outlineColor: e.target.value })
                  }
                  disabled={disabled}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            {/* 字重 / 字形 */}
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['overlayBold', 'bold', overlay.bold],
                  ['overlayItalic', 'italic', overlay.italic],
                  ['overlayUnderline', 'underline', overlay.underline],
                  ['overlayStrike', 'strikeOut', overlay.strikeOut],
                ] as const
              ).map(([id, field, checked]) => (
                <div key={id} className="flex items-center gap-2">
                  <Switch
                    id={id}
                    checked={checked}
                    onCheckedChange={(value) =>
                      onUpdateOverlay({ [field]: value })
                    }
                    disabled={disabled}
                  />
                  <Label htmlFor={id} className="text-sm cursor-pointer">
                    {t(field)}
                  </Label>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('outline')}</Label>
                <span className="text-xs text-muted-foreground">
                  {overlay.outline}px
                </span>
              </div>
              <Slider
                value={[overlay.outline]}
                min={OUTLINE_RANGE.min}
                max={OUTLINE_RANGE.max}
                step={1}
                onValueChange={([value]) => onUpdateOverlay({ outline: value })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('shadow')}</Label>
                <span className="text-xs text-muted-foreground">
                  {overlay.shadow}px
                </span>
              </div>
              <Slider
                value={[overlay.shadow]}
                min={SHADOW_RANGE.min}
                max={SHADOW_RANGE.max}
                step={1}
                onValueChange={([value]) => onUpdateOverlay({ shadow: value })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('borderStyle')}</Label>
              <Select
                value={String(overlay.borderStyle)}
                onValueChange={(value) =>
                  onUpdateOverlay({ borderStyle: Number(value) as BorderStyle })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BORDER_STYLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {overlay.borderStyle === 3 && (
              <div className="space-y-2">
                <Label className="text-sm">{t('backgroundColor')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={overlay.backColor}
                    onChange={(e) =>
                      onUpdateOverlay({ backColor: e.target.value })
                    }
                    disabled={disabled}
                    className="w-12 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={overlay.backColor}
                    onChange={(e) =>
                      onUpdateOverlay({ backColor: e.target.value })
                    }
                    disabled={disabled}
                    className="flex-1 font-mono text-sm"
                  />
                </div>
              </div>
            )}

            <Collapsible open={styleOpen} onOpenChange={setStyleOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <span>{t('overlayTypography')}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${styleOpen ? 'rotate-180' : ''}`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t('scaleX')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {overlay.scaleX}%
                    </span>
                  </div>
                  <Slider
                    value={[overlay.scaleX]}
                    min={SCALE_RANGE.min}
                    max={SCALE_RANGE.max}
                    step={5}
                    onValueChange={([value]) =>
                      onUpdateOverlay({ scaleX: value })
                    }
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t('scaleY')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {overlay.scaleY}%
                    </span>
                  </div>
                  <Slider
                    value={[overlay.scaleY]}
                    min={SCALE_RANGE.min}
                    max={SCALE_RANGE.max}
                    step={5}
                    onValueChange={([value]) =>
                      onUpdateOverlay({ scaleY: value })
                    }
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t('letterSpacing')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {overlay.letterSpacing}px
                    </span>
                  </div>
                  <Slider
                    value={[overlay.letterSpacing]}
                    min={LETTER_SPACING_RANGE.min}
                    max={LETTER_SPACING_RANGE.max}
                    step={0.5}
                    onValueChange={([value]) =>
                      onUpdateOverlay({ letterSpacing: value })
                    }
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t('angle')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {overlay.angle}°
                    </span>
                  </div>
                  <Slider
                    value={[overlay.angle]}
                    min={ANGLE_RANGE.min}
                    max={ANGLE_RANGE.max}
                    step={1}
                    onValueChange={([value]) =>
                      onUpdateOverlay({ angle: value })
                    }
                    disabled={disabled}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-sm">{t('positionAnchor')}</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  {t('overlayAlignmentHint')}
                </p>
                <AlignmentSelector
                  value={overlay.alignment}
                  onChange={handleAlignmentChange}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('marginVertical')}</Label>
                <span className="text-xs text-muted-foreground">
                  {overlay.marginV}px
                </span>
              </div>
              <Slider
                value={[overlay.marginV]}
                min={MARGIN_RANGE.min}
                max={MARGIN_RANGE.max}
                step={2}
                onValueChange={([value]) => {
                  const pos = getOverlayPositionForAlignment(
                    overlay.alignment,
                    overlay.marginL,
                    overlay.marginR,
                    value,
                    videoWidth,
                    videoHeight,
                  );
                  onUpdateOverlay({ marginV: value, ...pos });
                }}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('posX')}</Label>
                <span className="text-xs text-muted-foreground">
                  {overlay.posXPercent.toFixed(1)}%
                </span>
              </div>
              <Slider
                value={[overlay.posXPercent]}
                min={CUSTOM_POS_RANGE.min}
                max={CUSTOM_POS_RANGE.max}
                step={0.5}
                onValueChange={([value]) =>
                  onUpdateOverlay({ posXPercent: value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t('posY')}</Label>
                <span className="text-xs text-muted-foreground">
                  {overlay.posYPercent.toFixed(1)}%
                </span>
              </div>
              <Slider
                value={[overlay.posYPercent]}
                min={CUSTOM_POS_RANGE.min}
                max={CUSTOM_POS_RANGE.max}
                step={0.5}
                onValueChange={([value]) =>
                  onUpdateOverlay({ posYPercent: value })
                }
                disabled={disabled}
              />
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
