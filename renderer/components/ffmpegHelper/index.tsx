import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Gauge,
  AudioLines,
  FileAudio,
  Upload,
  FolderOpen,
  Film,
  Music2,
  Zap,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpeedSelector, combineSpeed } from './SpeedSelector';
import { OutputPathPreview } from './OutputPathPreview';
import {
  getInputExtension,
  useOutputPathPreview,
} from './useOutputPathPreview';
import { MergeVideosPanel } from './MergeVideosPanel';
import { MergeAudioPanel } from './MergeAudioPanel';
import {
  FfmpegHelperTip,
  ffmpegHelperCardClass,
  ffmpegHelperCardHeaderClass,
} from './FfmpegHelperTip';

interface FfmpegHelperPanelProps {
  onComplete: (message: string) => void;
  onError: (error: string) => void;
}

export function FfmpegHelperPanel({
  onComplete,
  onError,
}: FfmpegHelperPanelProps) {
  const { t } = useTranslation('ffmpegHelper');
  const [activeTab, setActiveTab] = useState('change-speed');

  const getGradientClass = () => {
    switch (activeTab) {
      case 'change-speed':
        return 'from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400';
      case 'extract-audio':
        return 'from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400';
      case 'convert-whisper':
        return 'from-pink-600 to-rose-600 dark:from-pink-400 dark:to-rose-400';
      case 'merge-videos':
        return 'from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400';
      case 'merge-audio':
        return 'from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400';
      default:
        return 'from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400';
    }
  };

  // Change Speed state
  const [speedInputFile, setSpeedInputFile] = useState('');
  const [speedOutputFolder, setSpeedOutputFolder] = useState('');
  const [speedTier, setSpeedTier] = useState('1.0');
  const [speedFine, setSpeedFine] = useState('0');

  // Extract Audio state
  const [audioInputFile, setAudioInputFile] = useState('');
  const [audioOutputFolder, setAudioOutputFolder] = useState('');
  const [audioFormat, setAudioFormat] = useState('wav');

  // Convert to Whisper state
  const [whisperInputFile, setWhisperInputFile] = useState('');
  const [whisperOutputFolder, setWhisperOutputFolder] = useState('');
  const [whisperSampleRate, setWhisperSampleRate] = useState('16000');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const speedSuffix = `_speed_${combineSpeed(speedTier, speedFine)}`;
  const speedExtension = getInputExtension(speedInputFile) || '.mp4';

  const speedOutputPreview = useOutputPathPreview({
    inputFile: speedInputFile,
    outputFolder: speedOutputFolder,
    suffix: speedSuffix,
    extension: speedExtension,
  });

  const audioOutputPreview = useOutputPathPreview({
    inputFile: audioInputFile,
    outputFolder: audioOutputFolder,
    suffix: '',
    extension: audioFormat,
  });

  const whisperOutputPreview = useOutputPathPreview({
    inputFile: whisperInputFile,
    outputFolder: whisperOutputFolder,
    suffix: '_whisper',
    extension: 'wav',
  });

  useEffect(() => {
    const unsubscribe = window?.ipc?.on(
      'ffmpeg-helper-progress',
      (_payload: { task: string; percent: number }) => {
        setProgress(_payload.percent);
      },
    );
    return () => unsubscribe?.();
  }, []);

  const buildOutputPath = useCallback(
    async (
      outputFolder: string,
      inputFile: string,
      suffix: string,
      extension: string,
    ) => {
      return window?.ipc?.invoke('ffmpeg-build-output-path', {
        outputFolder,
        inputFile,
        suffix,
        extension,
      });
    },
    [],
  );

  const handleSelectFile = async (type: 'speed' | 'audio' | 'whisper') => {
    try {
      const result = await window?.ipc?.invoke('select-file');
      if (result && !result.canceled) {
        const filePath = result.filePaths[0];
        switch (type) {
          case 'speed':
            setSpeedInputFile(filePath);
            break;
          case 'audio':
            setAudioInputFile(filePath);
            break;
          case 'whisper':
            setWhisperInputFile(filePath);
            break;
        }
      }
    } catch (error) {
      onError(t('selectFileError'));
    }
  };

  const handleSelectFolder = async (type: 'speed' | 'audio' | 'whisper') => {
    try {
      const result = await window?.ipc?.invoke('select-folder');
      if (result && !result.canceled) {
        const folderPath = result.filePaths[0];
        switch (type) {
          case 'speed':
            setSpeedOutputFolder(folderPath);
            break;
          case 'audio':
            setAudioOutputFolder(folderPath);
            break;
          case 'whisper':
            setWhisperOutputFolder(folderPath);
            break;
        }
      }
    } catch (error) {
      onError(t('selectFolderError'));
    }
  };

  const handleChangeSpeed = async () => {
    if (!speedInputFile || !speedOutputFolder) {
      onError(t('missingFiles'));
      return;
    }

    const extension = getInputExtension(speedInputFile) || '.mp4';

    try {
      setProcessing(true);
      setProgress(0);
      const speedValue = combineSpeed(speedTier, speedFine);
      const outputFile = await buildOutputPath(
        speedOutputFolder,
        speedInputFile,
        `_speed_${speedValue}`,
        extension,
      );
      await window?.ipc?.invoke('ffmpeg-change-speed', {
        inputFile: speedInputFile,
        outputFile,
        speed: parseFloat(speedValue),
      });
      onComplete(t('changeSpeedSuccess'));
    } catch (error) {
      onError(t('changeSpeedError'));
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleExtractAudio = async () => {
    if (!audioInputFile || !audioOutputFolder) {
      onError(t('missingFiles'));
      return;
    }

    try {
      setProcessing(true);
      setProgress(0);
      const outputFile = await buildOutputPath(
        audioOutputFolder,
        audioInputFile,
        '',
        audioFormat,
      );
      await window?.ipc?.invoke('ffmpeg-extract-audio', {
        inputFile: audioInputFile,
        outputFile,
        format: audioFormat,
      });
      onComplete(t('extractAudioSuccess'));
    } catch (error) {
      onError(t('extractAudioError'));
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleConvertToWhisper = async () => {
    if (!whisperInputFile || !whisperOutputFolder) {
      onError(t('missingFiles'));
      return;
    }

    try {
      setProcessing(true);
      setProgress(0);
      const outputFile = await buildOutputPath(
        whisperOutputFolder,
        whisperInputFile,
        '_whisper',
        'wav',
      );
      await window?.ipc?.invoke('ffmpeg-convert-whisper', {
        inputFile: whisperInputFile,
        outputFile,
        sampleRate: parseInt(whisperSampleRate),
      });
      onComplete(t('convertWhisperSuccess'));
    } catch (error) {
      onError(t('convertWhisperError'));
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col p-6 pt-8 pl-8">
          <div className="mb-6 flex-shrink-0">
            <h1
              className={`text-3xl font-bold bg-gradient-to-r ${getGradientClass()} bg-clip-text text-transparent mb-2 transition-all duration-300`}
            >
              {t('title')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Powerful FFmpeg tools for media processing
            </p>
          </div>

          <Tabs
            defaultValue="change-speed"
            className="flex min-h-0 flex-1 flex-col"
            onValueChange={setActiveTab}
          >
            <div className="flex min-h-0 flex-1 gap-8">
              <ScrollArea className="h-full w-72 shrink-0 rounded-2xl border border-slate-200/50 bg-white/50 shadow-lg shadow-slate-200/50 dark:border-slate-700/50 dark:bg-slate-800/50 dark:shadow-slate-900/50">
                <TabsList className="flex h-auto w-full flex-col gap-1 bg-transparent p-3">
                  <TabsTrigger
                    value="change-speed"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl transition-all duration-300 justify-start px-5 py-3.5"
                  >
                    <Gauge className="w-4 h-4 mr-3" />
                    {t('changeSpeed')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="extract-audio"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl transition-all duration-300 justify-start px-5 py-3.5"
                  >
                    <AudioLines className="w-4 h-4 mr-3" />
                    {t('extractAudio')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="convert-whisper"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-pink-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl transition-all duration-300 justify-start px-5 py-3.5"
                  >
                    <FileAudio className="w-4 h-4 mr-3" />
                    {t('convertWhisper')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="merge-audio"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl transition-all duration-300 justify-start px-5 py-3.5"
                  >
                    <Music2 className="w-4 h-4 mr-3" />
                    {t('mergeAudio')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="merge-videos"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl transition-all duration-300 justify-start px-5 py-3.5"
                  >
                    <Film className="w-4 h-4 mr-3" />
                    {t('mergeVideos')}
                  </TabsTrigger>
                </TabsList>
              </ScrollArea>
              <ScrollArea className="h-full min-h-0 min-w-0 flex-1">
                <div className="pt-2 pr-4 pb-4">
                  {/* Change Speed Tab */}
                  <TabsContent
                    value="change-speed"
                    className="mt-0 overflow-visible"
                  >
                    <Card
                      className={`${ffmpegHelperCardClass} shadow-2xl shadow-blue-500/10 dark:shadow-blue-500/5`}
                    >
                      <CardHeader
                        className={`${ffmpegHelperCardHeaderClass} bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20`}
                      >
                        <CardTitle className="flex items-center gap-3 text-xl">
                          <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                            <Gauge className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            {t('changeSpeed')}
                            <FfmpegHelperTip content={t('changeSpeedTip')} />
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('inputFile')}
                          </Label>
                          <div className="flex gap-3">
                            <Input
                              value={speedInputFile}
                              onChange={(e) =>
                                setSpeedInputFile(e.target.value)
                              }
                              placeholder={t('selectFilePlaceholder')}
                              readOnly
                              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                            />
                            <Button
                              onClick={() => handleSelectFile('speed')}
                              variant="outline"
                              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl transition-all duration-300 shadow-sm"
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('outputFolder')}
                          </Label>
                          <div className="flex gap-3">
                            <Input
                              value={speedOutputFolder}
                              onChange={(e) =>
                                setSpeedOutputFolder(e.target.value)
                              }
                              placeholder={t('selectFolderPlaceholder')}
                              readOnly
                              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                            />
                            <Button
                              onClick={() => handleSelectFolder('speed')}
                              variant="outline"
                              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl transition-all duration-300 shadow-sm"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <SpeedSelector
                          tier={speedTier}
                          fine={speedFine}
                          onTierChange={setSpeedTier}
                          onFineChange={setSpeedFine}
                          disabled={processing}
                        />

                        <OutputPathPreview preview={speedOutputPreview} />

                        <Button
                          onClick={handleChangeSpeed}
                          disabled={processing}
                          className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 font-semibold disabled:opacity-60"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {processing ? t('processing') : t('process')}
                        </Button>
                        {processing && activeTab === 'change-speed' && (
                          <Progress value={progress} className="h-2" />
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Extract Audio Tab */}
                  <TabsContent
                    value="extract-audio"
                    className="mt-0 overflow-visible"
                  >
                    <Card
                      className={`${ffmpegHelperCardClass} shadow-2xl shadow-purple-500/10 dark:shadow-purple-500/5`}
                    >
                      <CardHeader
                        className={`${ffmpegHelperCardHeaderClass} bg-gradient-to-r from-purple-500/10 to-pink-500/10 dark:from-purple-500/20 dark:to-pink-500/20`}
                      >
                        <CardTitle className="flex items-center gap-3 text-xl">
                          <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
                            <AudioLines className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            {t('extractAudio')}
                            <FfmpegHelperTip content={t('extractAudioTip')} />
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('inputFile')}
                          </Label>
                          <div className="flex gap-3">
                            <Input
                              value={audioInputFile}
                              onChange={(e) =>
                                setAudioInputFile(e.target.value)
                              }
                              placeholder={t('selectFilePlaceholder')}
                              readOnly
                              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500/20"
                            />
                            <Button
                              onClick={() => handleSelectFile('audio')}
                              variant="outline"
                              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 rounded-xl transition-all duration-300 shadow-sm"
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('outputFolder')}
                          </Label>
                          <div className="flex gap-3">
                            <Input
                              value={audioOutputFolder}
                              onChange={(e) =>
                                setAudioOutputFolder(e.target.value)
                              }
                              placeholder={t('selectFolderPlaceholder')}
                              readOnly
                              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500/20"
                            />
                            <Button
                              onClick={() => handleSelectFolder('audio')}
                              variant="outline"
                              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 rounded-xl transition-all duration-300 shadow-sm"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('audioFormat')}
                          </Label>
                          <Select
                            value={audioFormat}
                            onValueChange={setAudioFormat}
                          >
                            <SelectTrigger className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-purple-500/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-xl">
                              <SelectItem value="wav">WAV</SelectItem>
                              <SelectItem value="mp3">MP3</SelectItem>
                              <SelectItem value="aac">AAC</SelectItem>
                              <SelectItem value="flac">FLAC</SelectItem>
                              <SelectItem value="m4a">M4A</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <OutputPathPreview preview={audioOutputPreview} />

                        <Button
                          onClick={handleExtractAudio}
                          disabled={processing}
                          className="w-full h-12 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 font-semibold disabled:opacity-60"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {processing ? t('processing') : t('process')}
                        </Button>
                        {processing && activeTab === 'extract-audio' && (
                          <Progress value={progress} className="h-2" />
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Convert to Whisper Tab */}
                  <TabsContent
                    value="convert-whisper"
                    className="mt-0 overflow-visible"
                  >
                    <Card
                      className={`${ffmpegHelperCardClass} shadow-2xl shadow-pink-500/10 dark:shadow-pink-500/5`}
                    >
                      <CardHeader
                        className={`${ffmpegHelperCardHeaderClass} bg-gradient-to-r from-pink-500/10 to-rose-500/10 dark:from-pink-500/20 dark:to-rose-500/20`}
                      >
                        <CardTitle className="flex items-center gap-3 text-xl">
                          <div className="p-2 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl shadow-lg">
                            <FileAudio className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            {t('convertWhisper')}
                            <FfmpegHelperTip content={t('convertWhisperTip')} />
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('inputFile')}
                          </Label>
                          <div className="flex gap-3">
                            <Input
                              value={whisperInputFile}
                              onChange={(e) =>
                                setWhisperInputFile(e.target.value)
                              }
                              placeholder={t('selectFilePlaceholder')}
                              readOnly
                              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20"
                            />
                            <Button
                              onClick={() => handleSelectFile('whisper')}
                              variant="outline"
                              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-pink-50 dark:hover:bg-pink-900/20 hover:border-pink-300 dark:hover:border-pink-700 rounded-xl transition-all duration-300 shadow-sm"
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('outputFolder')}
                          </Label>
                          <div className="flex gap-3">
                            <Input
                              value={whisperOutputFolder}
                              onChange={(e) =>
                                setWhisperOutputFolder(e.target.value)
                              }
                              placeholder={t('selectFolderPlaceholder')}
                              readOnly
                              className="flex-1 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20"
                            />
                            <Button
                              onClick={() => handleSelectFolder('whisper')}
                              variant="outline"
                              className="bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 hover:bg-pink-50 dark:hover:bg-pink-900/20 hover:border-pink-300 dark:hover:border-pink-700 rounded-xl transition-all duration-300 shadow-sm"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {t('sampleRate')}
                          </Label>
                          <Select
                            value={whisperSampleRate}
                            onValueChange={setWhisperSampleRate}
                          >
                            <SelectTrigger className="bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-pink-500/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-xl">
                              <SelectItem value="8000">8000 Hz</SelectItem>
                              <SelectItem value="16000">16000 Hz</SelectItem>
                              <SelectItem value="22050">22050 Hz</SelectItem>
                              <SelectItem value="44100">44100 Hz</SelectItem>
                              <SelectItem value="48000">48000 Hz</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <OutputPathPreview preview={whisperOutputPreview} />

                        <Button
                          onClick={handleConvertToWhisper}
                          disabled={processing}
                          className="w-full h-12 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white rounded-xl shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all duration-300 font-semibold disabled:opacity-60"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {processing ? t('processing') : t('process')}
                        </Button>
                        {processing && activeTab === 'convert-whisper' && (
                          <Progress value={progress} className="h-2" />
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent
                    value="merge-audio"
                    className="mt-0 overflow-visible"
                  >
                    <MergeAudioPanel
                      processing={processing}
                      progress={progress}
                      active={activeTab === 'merge-audio'}
                      onComplete={onComplete}
                      onError={onError}
                      onProcessingChange={setProcessing}
                      onProgressReset={() => setProgress(0)}
                      buildOutputPath={buildOutputPath}
                    />
                  </TabsContent>

                  <TabsContent
                    value="merge-videos"
                    className="mt-0 overflow-visible"
                  >
                    <MergeVideosPanel
                      processing={processing}
                      progress={progress}
                      active={activeTab === 'merge-videos'}
                      onComplete={onComplete}
                      onError={onError}
                      onProcessingChange={setProcessing}
                      onProgressReset={() => setProgress(0)}
                      buildOutputPath={buildOutputPath}
                    />
                  </TabsContent>
                </div>
              </ScrollArea>
            </div>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
