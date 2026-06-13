import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  FfmpegHelperTip,
  ffmpegHelperCardClass,
  ffmpegHelperCardHeaderClass,
} from './FfmpegHelperTip';
import {
  Music2,
  Upload,
  FolderOpen,
  Zap,
  Video,
  FileAudio,
} from 'lucide-react';
import { OutputPathPreview } from './OutputPathPreview';
import { useOutputPathPreview } from './useOutputPathPreview';

interface MergeAudioPanelProps {
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

function volumeToPercent(volume: number): number {
  return Math.round(volume * 100);
}

function percentToVolume(percent: number): number {
  return Math.round(percent) / 100;
}

export function MergeAudioPanel({
  processing,
  progress,
  active,
  onComplete,
  onError,
  onProcessingChange,
  onProgressReset,
  buildOutputPath,
}: MergeAudioPanelProps) {
  const { t } = useTranslation('ffmpegHelper');
  const [videoFile, setVideoFile] = useState('');
  const [audioFile, setAudioFile] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [outputFormat, setOutputFormat] = useState('mp4');
  const [mode, setMode] = useState<'mix' | 'replace'>('mix');
  const [originalVolume, setOriginalVolume] = useState(1);
  const [externalVolume, setExternalVolume] = useState(1);
  const [audioOffsetSec, setAudioOffsetSec] = useState('0');
  const [loopExternalAudio, setLoopExternalAudio] = useState(false);
  const [copyVideo, setCopyVideo] = useState(true);

  const mergeAudioPreview = useOutputPathPreview({
    inputFile: videoFile,
    outputFolder,
    suffix: '_audio_merged',
    extension: outputFormat,
  });

  const selectTriggerClass =
    'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-amber-500/20';
  const selectContentClass =
    'bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-xl';

  const handleSelectVideo = async () => {
    try {
      const result = await window?.ipc?.invoke('select-file');
      if (result && !result.canceled) {
        setVideoFile(result.filePaths[0]);
      }
    } catch {
      onError(t('selectFileError'));
    }
  };

  const handleSelectAudio = async () => {
    try {
      const result = await window?.ipc?.invoke('select-file');
      if (result && !result.canceled) {
        setAudioFile(result.filePaths[0]);
      }
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

  const handleMerge = async () => {
    if (!videoFile || !audioFile || !outputFolder) {
      onError(t('mergeAudioMissingFiles'));
      return;
    }

    const offset = parseFloat(audioOffsetSec);
    if (!Number.isFinite(offset) || offset < -3600 || offset > 3600) {
      onError(t('invalidAudioOffset'));
      return;
    }

    try {
      onProcessingChange(true);
      onProgressReset();
      const outputFile = await buildOutputPath(
        outputFolder,
        videoFile,
        '_audio_merged',
        outputFormat,
      );
      await window?.ipc?.invoke('ffmpeg-merge-audio', {
        videoFile,
        audioFile,
        outputFile,
        mode,
        originalVolume,
        externalVolume,
        audioOffsetSec: offset,
        loopExternalAudio,
        copyVideo,
      });
      onComplete(t('mergeAudioSuccess'));
    } catch {
      onError(t('mergeAudioError'));
    } finally {
      onProcessingChange(false);
      onProgressReset();
    }
  };

  return (
    <Card
      className={`${ffmpegHelperCardClass} shadow-2xl shadow-amber-500/10 dark:shadow-amber-500/5`}
    >
      <CardHeader
        className={`${ffmpegHelperCardHeaderClass} bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20`}
      >
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 flex items-center gap-2">
            {t('mergeAudio')}
            <FfmpegHelperTip content={t('mergeAudioTip')} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('videoFile')}
          </Label>
          <div className="flex gap-3">
            <Input
              value={videoFile}
              placeholder={t('selectVideoPlaceholder')}
              readOnly
              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-amber-500/20"
            />
            <Button
              onClick={handleSelectVideo}
              variant="outline"
              disabled={processing}
              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 rounded-xl transition-all duration-300 shadow-sm"
            >
              <Video className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('externalAudioFile')}
          </Label>
          <div className="flex gap-3">
            <Input
              value={audioFile}
              placeholder={t('selectAudioPlaceholder')}
              readOnly
              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-amber-500/20"
            />
            <Button
              onClick={handleSelectAudio}
              variant="outline"
              disabled={processing}
              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 rounded-xl transition-all duration-300 shadow-sm"
            >
              <FileAudio className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('mergeAudioMode')}
          </Label>
          <Select
            value={mode}
            onValueChange={(value) => setMode(value as 'mix' | 'replace')}
            disabled={processing}
          >
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              <SelectItem value="mix">{t('mergeAudioModeMix')}</SelectItem>
              <SelectItem value="replace">
                {t('mergeAudioModeReplace')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          className={`grid gap-6 sm:grid-cols-2 ${mode === 'replace' ? 'opacity-50' : ''}`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t('originalVolume')}
              </Label>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {volumeToPercent(originalVolume)}%
              </span>
            </div>
            <Slider
              value={[volumeToPercent(originalVolume)]}
              min={0}
              max={200}
              step={1}
              disabled={processing || mode === 'replace'}
              onValueChange={([value]) =>
                setOriginalVolume(percentToVolume(value))
              }
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t('externalVolume')}
              </Label>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {volumeToPercent(externalVolume)}%
              </span>
            </div>
            <Slider
              value={[volumeToPercent(externalVolume)]}
              min={0}
              max={200}
              step={1}
              disabled={processing}
              onValueChange={([value]) =>
                setExternalVolume(percentToVolume(value))
              }
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t('audioOffset')}
            </Label>
            <Input
              type="number"
              value={audioOffsetSec}
              onChange={(e) => setAudioOffsetSec(e.target.value)}
              min={-3600}
              max={3600}
              step={0.1}
              disabled={processing}
              placeholder="0"
              className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-amber-500/20"
            />
            <p className="text-xs text-muted-foreground">
              {t('audioOffsetHint')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {t('loopExternalAudio')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('loopExternalAudioHint')}
                </p>
              </div>
              <Switch
                checked={loopExternalAudio}
                onCheckedChange={setLoopExternalAudio}
                disabled={processing}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {t('copyVideoStream')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('copyVideoStreamHint')}
                </p>
              </div>
              <Switch
                checked={copyVideo}
                onCheckedChange={setCopyVideo}
                disabled={processing}
              />
            </div>
          </div>
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
              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-amber-500/20"
            />
            <Button
              onClick={handleSelectFolder}
              variant="outline"
              disabled={processing}
              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 rounded-xl transition-all duration-300 shadow-sm"
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('mergeOutputFormat')}
          </Label>
          <Select
            value={outputFormat}
            onValueChange={setOutputFormat}
            disabled={processing}
          >
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="mkv">MKV</SelectItem>
              <SelectItem value="mov">MOV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <OutputPathPreview preview={mergeAudioPreview} />

        <Button
          onClick={handleMerge}
          disabled={processing || !videoFile || !audioFile || !outputFolder}
          className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all duration-300 font-semibold disabled:opacity-60"
        >
          <Zap className="w-4 h-4 mr-2" />
          {processing ? t('processing') : t('mergeAudioProcess')}
        </Button>

        {processing && active && <Progress value={progress} className="h-2" />}
      </CardContent>
    </Card>
  );
}
