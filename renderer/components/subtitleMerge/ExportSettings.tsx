/**
 * 视频导出设置：分辨率与 FPS
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  VideoExportSettings,
  VideoInfo,
} from '../../../types/subtitleMerge';
import {
  RESOLUTION_PRESETS,
  FPS_PRESETS,
  CUSTOM_RESOLUTION_RANGE,
  CUSTOM_FPS_RANGE,
} from './constants';

interface ExportSettingsProps {
  exportSettings: VideoExportSettings;
  videoInfo: VideoInfo | null;
  onUpdateExportSettings: (updates: Partial<VideoExportSettings>) => void;
  disabled?: boolean;
}

export default function ExportSettings({
  exportSettings,
  videoInfo,
  onUpdateExportSettings,
  disabled = false,
}: ExportSettingsProps) {
  const { t } = useTranslation('subtitleMerge');

  const [fpsPreset, setFpsPreset] = React.useState<string>(() => {
    if (exportSettings.fpsMode === 'source') return 'source';
    const matched = FPS_PRESETS.find(
      (item) =>
        typeof item.value === 'number' &&
        item.value === exportSettings.customFps,
    );
    return matched ? String(matched.value) : 'custom';
  });

  React.useEffect(() => {
    if (exportSettings.fpsMode === 'source') {
      setFpsPreset('source');
      return;
    }
    const matched = FPS_PRESETS.find(
      (item) =>
        typeof item.value === 'number' &&
        item.value === exportSettings.customFps,
    );
    setFpsPreset(matched ? String(matched.value) : 'custom');
  }, [exportSettings.fpsMode, exportSettings.customFps]);

  const handleFpsPresetChange = (value: string) => {
    setFpsPreset(value);
    if (value === 'source') {
      onUpdateExportSettings({ fpsMode: 'source' });
      return;
    }
    if (value === 'custom') {
      onUpdateExportSettings({ fpsMode: 'custom' });
      return;
    }
    onUpdateExportSettings({
      fpsMode: 'custom',
      customFps: Number(value),
    });
  };

  const sourceLabel = videoInfo
    ? `${videoInfo.width}x${videoInfo.height}${videoInfo.fps ? ` · ${videoInfo.fps}fps` : ''}`
    : t('resolutionSourceHint');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">{t('exportResolution')}</Label>
        <Select
          value={exportSettings.resolutionPreset}
          onValueChange={(value) =>
            onUpdateExportSettings({
              resolutionPreset:
                value as VideoExportSettings['resolutionPreset'],
            })
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTION_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {t(preset.labelKey)}
                {preset.value === 'source' ? ` (${sourceLabel})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {exportSettings.resolutionPreset === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm">{t('customWidth')}</Label>
            <Input
              type="number"
              value={exportSettings.customWidth}
              min={CUSTOM_RESOLUTION_RANGE.width.min}
              max={CUSTOM_RESOLUTION_RANGE.width.max}
              onChange={(e) =>
                onUpdateExportSettings({ customWidth: Number(e.target.value) })
              }
              disabled={disabled}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">{t('customHeight')}</Label>
            <Input
              type="number"
              value={exportSettings.customHeight}
              min={CUSTOM_RESOLUTION_RANGE.height.min}
              max={CUSTOM_RESOLUTION_RANGE.height.max}
              onChange={(e) =>
                onUpdateExportSettings({ customHeight: Number(e.target.value) })
              }
              disabled={disabled}
              className="text-sm"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">{t('exportFps')}</Label>
        <Select
          value={fpsPreset}
          onValueChange={handleFpsPresetChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FPS_PRESETS.map((preset) => (
              <SelectItem
                key={String(preset.value)}
                value={String(preset.value)}
              >
                {t(preset.labelKey)}
                {preset.value === 'source' && videoInfo?.fps
                  ? ` (${videoInfo.fps}fps)`
                  : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Render mode</Label>
        <Select
          value={exportSettings.renderMode}
          onValueChange={(value) =>
            onUpdateExportSettings({
              renderMode: value as VideoExportSettings['renderMode'],
            })
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cpu">CPU (libx264)</SelectItem>
            <SelectItem value="gpu">
              GPU (hardware encoder, fallback CPU)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {exportSettings.fpsMode === 'custom' && fpsPreset === 'custom' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('customFps')}</Label>
            <span className="text-sm text-muted-foreground">
              {exportSettings.customFps} fps
            </span>
          </div>
          <Slider
            value={[exportSettings.customFps]}
            min={CUSTOM_FPS_RANGE.min}
            max={CUSTOM_FPS_RANGE.max}
            step={1}
            onValueChange={([value]) =>
              onUpdateExportSettings({ customFps: value })
            }
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
