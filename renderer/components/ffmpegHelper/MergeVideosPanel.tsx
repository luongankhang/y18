import React, { useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FfmpegHelperTip,
  ffmpegHelperCardClass,
  ffmpegHelperCardHeaderClass,
} from './FfmpegHelperTip';
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Zap,
  Film,
  FolderOpen,
} from 'lucide-react';
import { OutputPathPreview } from './OutputPathPreview';
import { useOutputPathPreview } from './useOutputPathPreview';
import { isHelperTaskCancelled } from './helperTaskError';
import {
  AdvancedFieldHint,
  AdvancedOptionsSection,
} from './AdvancedOptionsSection';
import { EncodePresetSelect, CrfQualitySelect } from './AdvancedSelectFields';
import { FfmpegOptionSelect } from './FfmpegOptionSelect';
import {
  FfmpegHelperProgressDisplay,
  processingButtonLabel,
} from './FfmpegHelperProgressDisplay';
import {
  AUDIO_BITRATE_OPTIONS,
  FPS_OPTIONS_LIST,
  OUTPUT_FORMAT_OPTIONS,
  RESOLUTION_OPTIONS_LIST,
} from './ffmpegSelectOptions';

interface MergeVideosPanelProps {
  processing: boolean;
  progress: number;
  active: boolean;
  onComplete: (message: string) => void;
  onError: (error: string) => void;
  onProcessingChange: (processing: boolean) => void;
  onProgressReset: () => void;
  buildOutputPath: (
    outputFolder: string,
    inputFile: string,
    suffix: string,
    extension: string,
  ) => Promise<string>;
}

export function MergeVideosPanel({
  processing,
  progress,
  active,
  onComplete,
  onError,
  onProcessingChange,
  onProgressReset,
  buildOutputPath,
}: MergeVideosPanelProps) {
  const { t } = useTranslation('ffmpegHelper');
  const [videos, setVideos] = useState<string[]>([]);
  const [outputFolder, setOutputFolder] = useState('');
  const [outputFormat, setOutputFormat] = useState('mp4');
  const [targetResolution, setTargetResolution] = useState('1080');
  const [targetFps, setTargetFps] = useState('30');
  const [videoPreset, setVideoPreset] = useState('fast');
  const [crf, setCrf] = useState('23');
  const [audioBitrate, setAudioBitrate] = useState('192');

  const mergeOutputPreview = useOutputPathPreview({
    inputFile: videos[0] || '',
    outputFolder,
    suffix: '_merged',
    extension: outputFormat,
  });

  const handleAddVideos = async () => {
    try {
      const result = await window?.ipc?.invoke('select-video-files');
      if (result?.canceled || !result?.filePaths?.length) {
        return;
      }

      setVideos((prev) => {
        const merged = [...prev];
        for (const filePath of result.filePaths) {
          if (!merged.includes(filePath)) {
            merged.push(filePath);
          }
        }
        return merged;
      });
    } catch {
      onError(t('selectFileError'));
    }
  };

  const handleSelectFolder = async () => {
    try {
      const result = await window?.ipc?.invoke('select-folder');
      if (result && !result.canceled) {
        setOutputFolder(result.filePaths[0]);
      }
    } catch {
      onError(t('selectFolderError'));
    }
  };

  const moveVideo = useCallback((index: number, direction: -1 | 1) => {
    setVideos((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }, []);

  const removeVideo = useCallback((index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMerge = async () => {
    if (videos.length < 2) {
      onError(t('mergeMinTwoVideos'));
      return;
    }

    if (!outputFolder) {
      onError(t('missingFiles'));
      return;
    }

    try {
      onProcessingChange(true);
      onProgressReset();
      const outputFile = await buildOutputPath(
        outputFolder,
        videos[0],
        '_merged',
        outputFormat,
      );
      await window?.ipc?.invoke('ffmpeg-merge-videos', {
        inputFiles: videos,
        outputFile,
        targetResolution,
        targetFps: parseInt(targetFps, 10),
        videoPreset,
        crf: parseInt(crf, 10),
        audioBitrateKbps: parseInt(audioBitrate, 10),
      });
      onComplete(t('mergeVideosSuccess'));
    } catch (error) {
      if (isHelperTaskCancelled(error)) {
        onComplete(t('taskCancelled'));
      } else {
        onError(t('mergeVideosError'));
      }
    } finally {
      onProcessingChange(false);
      onProgressReset();
    }
  };

  const selectTriggerClass =
    'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-emerald-500/20';

  return (
    <Card
      className={`${ffmpegHelperCardClass} shadow-2xl shadow-emerald-500/10 dark:shadow-emerald-500/5`}
    >
      <CardHeader
        className={`${ffmpegHelperCardHeaderClass} bg-gradient-to-r from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20`}
      >
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 flex items-center gap-2">
            {t('mergeVideos')}
            <FfmpegHelperTip content={t('mergeVideosTip')} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t('mergeVideoList')}
              {videos.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({videos.length})
                </span>
              )}
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddVideos}
              disabled={processing}
              className="rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t('addVideos')}
            </Button>
          </div>

          {videos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-6 text-center text-sm text-muted-foreground dark:border-slate-700/60 dark:bg-slate-900/30">
              {t('mergeVideoListEmpty')}
            </div>
          ) : (
            <ScrollArea className="max-h-[min(22rem,45vh)] min-h-[8rem] rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <div className="space-y-2 p-2">
                {videos.map((filePath, index) => {
                  const fileName = filePath.split(/[/\\]/).pop() || filePath;
                  return (
                    <div
                      key={`${filePath}-${index}`}
                      className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900/40"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        title={filePath}
                      >
                        {fileName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={processing || index === 0}
                          onClick={() => moveVideo(index, -1)}
                          aria-label={t('moveUp')}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={processing || index === videos.length - 1}
                          onClick={() => moveVideo(index, 1)}
                          aria-label={t('moveDown')}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={processing}
                          onClick={() => removeVideo(index)}
                          aria-label={t('removeVideo')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('outputFolder')}
          </Label>
          <div className="flex gap-3">
            <Input
              value={outputFolder}
              placeholder={t('selectFolderPlaceholder')}
              readOnly
              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
            />
            <Button
              onClick={handleSelectFolder}
              variant="outline"
              disabled={processing}
              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 rounded-xl transition-all duration-300 shadow-sm"
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <FfmpegOptionSelect
          label={t('mergeOutputFormat')}
          value={outputFormat}
          onValueChange={setOutputFormat}
          options={OUTPUT_FORMAT_OPTIONS}
          disabled={processing}
          triggerClassName={selectTriggerClass}
        />

        <AdvancedOptionsSection
          disabled={processing}
          accentClass="border-emerald-200/60 dark:border-emerald-800/60"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FfmpegOptionSelect
              label={t('targetResolution')}
              value={targetResolution}
              onValueChange={setTargetResolution}
              options={RESOLUTION_OPTIONS_LIST}
              disabled={processing}
            />
            <FfmpegOptionSelect
              label={t('targetFps')}
              value={targetFps}
              onValueChange={setTargetFps}
              options={FPS_OPTIONS_LIST}
              disabled={processing}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <EncodePresetSelect
              label={t('videoEncodePreset')}
              value={videoPreset}
              onValueChange={setVideoPreset}
              disabled={processing}
            />
            <CrfQualitySelect
              label={t('videoQualityCrf')}
              value={crf}
              onValueChange={setCrf}
              disabled={processing}
            />
          </div>
          <FfmpegOptionSelect
            label={t('audioBitrate')}
            value={audioBitrate}
            onValueChange={setAudioBitrate}
            options={AUDIO_BITRATE_OPTIONS}
            disabled={processing}
          />
          <AdvancedFieldHint>{t('mergeVideosAdvancedHint')}</AdvancedFieldHint>
        </AdvancedOptionsSection>

        <OutputPathPreview preview={mergeOutputPreview} />

        <Button
          onClick={handleMerge}
          disabled={processing || videos.length < 2 || !outputFolder}
          className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 font-semibold disabled:opacity-60"
        >
          <Zap className="w-4 h-4 mr-2" />
          {processingButtonLabel(
            processing,
            progress,
            t('mergeVideosProcess'),
            t('processing'),
          )}
        </Button>

        {processing && active && (
          <FfmpegHelperProgressDisplay value={progress} />
        )}
      </CardContent>
    </Card>
  );
}
