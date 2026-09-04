import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  FolderOpen,
  Mic2,
  Music2,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Upload,
  Video,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import type {
  DemucsProcessingOptions,
  VoiceRuntimeInfo,
  VoiceSeparationDevice,
  VoiceSeparationJob,
  VoiceSeparationMode,
  VoiceOutputPreset,
} from '../../../types/voiceSeparation';

interface VoiceSeparationPanelProps {
  onError: (message: string) => void;
}

const fileName = (value: string) => value.split(/[\\/]/).pop() || value;

const voiceErrorMessage = (error?: string) => {
  const code = Object.keys({
    VOICE_RUNTIME_MISSING: true,
    VOICE_IPC_UNAVAILABLE: true,
    VOICE_DEMUCS_OR_TORCH_MISSING: true,
    VOICE_AUDIO_BACKEND_MISSING: true,
    VOICE_GPU_UNAVAILABLE: true,
    WHISPER_MODEL_MISSING: true,
    VOICE_VIDEO_OUTPUT_REQUIRES_VIDEO: true,
    NO_AUDIO_STREAM: true,
  }).find((item) => error?.includes(item));
  const messages: Record<string, string> = {
    VOICE_RUNTIME_MISSING: 'Chưa tìm thấy Python runtime.',
    VOICE_IPC_UNAVAILABLE:
      'Tính năng này chỉ hoạt động trong ứng dụng desktop.',
    VOICE_DEMUCS_OR_TORCH_MISSING:
      'Đã tìm thấy Python nhưng thiếu Demucs hoặc Torch.',
    VOICE_AUDIO_BACKEND_MISSING:
      'Runtime thiếu audio backend để Demucs ghi WAV. Hãy cài soundfile vào Python runtime.',
    VOICE_GPU_UNAVAILABLE:
      'Torch hiện tại chưa dùng được CUDA. Hãy chọn đúng Python có Torch CUDA.',
    WHISPER_MODEL_MISSING: 'Chưa cài Whisper model đã chọn.',
    VOICE_VIDEO_OUTPUT_REQUIRES_VIDEO:
      'Đầu ra video yêu cầu file nguồn có hình ảnh.',
    NO_AUDIO_STREAM: 'File nguồn không có audio có thể giải mã.',
  };
  return code ? messages[code] : error || 'VOICE_UNKNOWN_ERROR';
};

const runtimeSummary = (runtime?: VoiceRuntimeInfo | null) => {
  if (!runtime) return 'Cài runtime đóng gói hoặc chọn Python có Demucs.';
  const gpuDetails = runtime.nvidiaHardwareAvailable
    ? `${runtime.gpuName || 'NVIDIA GPU'} · Driver ${
        runtime.nvidiaDriverVersion || 'đã nhận'
      }${
        runtime.nvidiaCudaVersion
          ? ` · CUDA driver ${runtime.nvidiaCudaVersion}`
          : ''
      }`
    : 'Chưa phát hiện NVIDIA GPU';
  if (!runtime.available)
    return runtime.nvidiaHardwareAvailable
      ? `${gpuDetails} · Thiếu Python/Demucs/Torch CUDA`
      : 'Cài runtime đóng gói hoặc đặt Y18_DEMUCS_PYTHON tới Python có Demucs và Torch.';
  const pythonDetails = `Python ${runtime.pythonVersion} · Demucs ${runtime.demucsVersion} · Torch ${runtime.torchVersion} · Audio ${
    runtime.audioBackends?.length ? runtime.audioBackends.join(', ') : 'missing'
  }`;
  if (runtime.cudaAvailable)
    return `${pythonDetails} · GPU ${runtime.gpuName || 'CUDA'}`;
  return runtime.nvidiaHardwareAvailable
    ? `${pythonDetails} · ${gpuDetails} · Torch hiện tại là CPU`
    : `${pythonDetails} · CPU`;
};

export function VoiceSeparationPanel({ onError }: VoiceSeparationPanelProps) {
  const { t } = useTranslation('ffmpegHelper');
  const localizedErrorMessage = (error?: string) =>
    error?.includes('VOICE_IPC_UNAVAILABLE')
      ? t('voice.desktopOnly')
      : voiceErrorMessage(error);
  const [runtime, setRuntime] = useState<VoiceRuntimeInfo | null>(null);
  const [jobs, setJobs] = useState<VoiceSeparationJob[]>([]);
  const [inputFiles, setInputFiles] = useState<string[]>([]);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [mode, setMode] = useState<VoiceSeparationMode>('vocals');
  const [device, setDevice] = useState<VoiceSeparationDevice>('auto');
  const [modelId, setModelId] = useState('htdemucs');
  const [outputs, setOutputs] = useState<VoiceOutputPreset[]>(['voice']);
  const [speed, setSpeed] = useState(1);
  const [keepPitch, setKeepPitch] = useState(true);
  const [keepStems, setKeepStems] = useState(true);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
  const [whisperModel, setWhisperModel] = useState('base');
  const [whisperLanguage, setWhisperLanguage] = useState('auto');
  const [whisperModels, setWhisperModels] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [demucs, setDemucs] = useState<DemucsProcessingOptions>({
    shifts: 1,
    overlap: 0.25,
    jobs: 0,
    split: true,
    bitDepth: 'int16',
    clipMode: 'rescale',
  });
  const [loadingRuntime, setLoadingRuntime] = useState(true);

  const refreshRuntime = useCallback(async () => {
    setLoadingRuntime(true);
    try {
      if (!window.ipc) {
        setRuntime({
          available: false,
          cudaAvailable: false,
          error: 'VOICE_IPC_UNAVAILABLE',
        });
        return;
      }
      setRuntime(await window.ipc.invoke('voice-separation:runtime'));
    } finally {
      setLoadingRuntime(false);
    }
  }, []);

  useEffect(() => {
    void refreshRuntime();
    if (!window.ipc) return;
    void window.ipc.invoke('voice-separation:list').then(setJobs);
    void window.ipc
      .invoke('voice-separation:whisper-models')
      .then((models: string[]) => {
        setWhisperModels(models);
        if (models.length && !models.includes(whisperModel))
          setWhisperModel(models[0]);
      });
    return window.ipc.on(
      'voice-separation:update',
      (next: VoiceSeparationJob[]) => setJobs(next),
    );
  }, [refreshRuntime]);

  const selectInputs = async () => {
    if (!window.ipc) return onError('VOICE_IPC_UNAVAILABLE');
    const result = await window.ipc.invoke('selectFiles', {
      type: 'any',
      multiple: true,
      title: 'Chọn video hoặc audio để tách voice',
    });
    if (!result?.canceled) setInputFiles(result.filePaths || []);
  };

  const selectOutput = async () => {
    if (!window.ipc) return onError('VOICE_IPC_UNAVAILABLE');
    const result = await window.ipc.invoke('select-folder');
    if (!result?.canceled) setOutputDirectory(result.filePaths?.[0] || '');
  };

  const selectRuntime = async () => {
    if (!window.ipc) return onError('VOICE_IPC_UNAVAILABLE');
    const result = await window.ipc.invoke('voice-separation:select-runtime');
    if (result) setRuntime(result);
  };

  const enqueue = async () => {
    if (!window.ipc) return onError('VOICE_IPC_UNAVAILABLE');
    if (!runtime?.available) return onError('VOICE_RUNTIME_MISSING');
    if (!inputFiles.length || !outputDirectory)
      return onError('VOICE_INPUT_OR_OUTPUT_REQUIRED');
    try {
      await window.ipc.invoke('voice-separation:enqueue', {
        inputFiles,
        outputDirectory,
        mode,
        modelId,
        device,
        outputs,
        speed,
        keepPitch,
        keepStems,
        demucs,
        transcription: {
          enabled: transcriptionEnabled,
          model: whisperModel,
          language: whisperLanguage,
        },
      });
      setInputFiles([]);
    } catch (error) {
      onError(
        localizedErrorMessage(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  };

  const toggleOutput = (output: VoiceOutputPreset) => {
    setOutputs((current) =>
      current.includes(output)
        ? current.filter((item) => item !== output)
        : [...current, output],
    );
  };

  const applyQualityPreset = (preset: 'fast' | 'balanced' | 'best') => {
    if (preset === 'fast') {
      setModelId('mdx_q');
      setDemucs((current) => ({
        ...current,
        shifts: 1,
        overlap: 0.1,
        bitDepth: 'int16',
      }));
    } else if (preset === 'best') {
      setModelId('htdemucs_ft');
      setDemucs((current) => ({
        ...current,
        shifts: 2,
        overlap: 0.25,
        bitDepth: 'int24',
      }));
    } else {
      setModelId('htdemucs');
      setDemucs((current) => ({
        ...current,
        shifts: 1,
        overlap: 0.25,
        bitDepth: 'int16',
      }));
    }
  };

  const hasVideoOutput = outputs.some((output) => output !== 'voice');
  const transcriptionReady =
    !transcriptionEnabled || whisperModels.includes(whisperModel);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-cyan-200/60 shadow-xl shadow-cyan-500/5 dark:border-cyan-900/70">
        <CardHeader className="border-b bg-gradient-to-r from-cyan-500/10 to-emerald-500/10">
          <CardTitle className="flex items-center gap-3 text-xl">
            <span className="rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-600 p-2 shadow-lg">
              <Mic2 className="h-5 w-5 text-white" />
            </span>
            {t('voice.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div
            className={`rounded-xl border p-4 ${runtime?.available ? 'border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                {runtime?.available ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {loadingRuntime
                      ? 'Đang kiểm tra runtime…'
                      : runtime?.available
                        ? t('voice.runtimeReady')
                        : localizedErrorMessage(runtime?.error)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {runtimeSummary(runtime)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {!runtime?.available && (
                  <Button size="sm" variant="outline" onClick={selectRuntime}>
                    <FolderOpen className="mr-1 h-3.5 w-3.5" />
                    {t('voice.selectPython')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refreshRuntime}
                  disabled={loadingRuntime}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {t('voice.recheck')}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>{t('voice.outputs')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('voice.outputsHint')}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  id: 'voice' as const,
                  title: t('voice.voice'),
                  description: t('voice.voiceDesc'),
                  icon: Mic2,
                },
                {
                  id: 'voice-video' as const,
                  title: t('voice.voiceVideo'),
                  description: t('voice.voiceVideoDesc'),
                  icon: Video,
                },
                {
                  id: 'karaoke-video' as const,
                  title: t('voice.karaokeVideo'),
                  description: t('voice.karaokeVideoDesc'),
                  icon: Music2,
                },
              ].map((item) => {
                const Icon = item.icon;
                const selected = outputs.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleOutput(item.id)}
                    className={`rounded-xl border p-4 text-left transition ${selected ? 'border-cyan-500 bg-cyan-50 shadow-sm dark:bg-cyan-950/20' : 'hover:border-cyan-300'}`}
                  >
                    <Icon
                      className={`mb-3 h-5 w-5 ${selected ? 'text-cyan-600' : 'text-muted-foreground'}`}
                    />
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('voice.sources')}</Label>
              <Button
                variant="outline"
                className="h-24 w-full border-dashed"
                onClick={selectInputs}
              >
                <Upload className="mr-2 h-5 w-5" />
                {inputFiles.length
                  ? t('voice.filesSelected', { count: inputFiles.length })
                  : t('voice.selectSources')}
              </Button>
              {inputFiles.length > 0 && (
                <div className="max-h-24 overflow-auto rounded-lg border p-2 text-xs">
                  {inputFiles.map((file) => (
                    <div key={file} className="truncate py-0.5">
                      {fileName(file)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('voice.outputFolder')}</Label>
              <div className="flex gap-2">
                <Input
                  value={outputDirectory}
                  readOnly
                  placeholder={t('voice.outputPlaceholder')}
                />
                <Button variant="outline" size="icon" onClick={selectOutput}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-xs">
                  <span>{t('voice.mode')}</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as VoiceSeparationMode)
                    }
                  >
                    <option value="vocals">Vocals + nhạc</option>
                    <option value="four-stems">4 stems</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>{t('voice.device')}</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={device}
                    onChange={(e) =>
                      setDevice(e.target.value as VoiceSeparationDevice)
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="cpu">CPU</option>
                    <option value="gpu">
                      NVIDIA GPU
                      {runtime?.cudaAvailable ? '' : ' (cần thiết lập)'}
                    </option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>{t('voice.model')}</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                  >
                    <option value="htdemucs">htdemucs</option>
                    <option value="htdemucs_ft">htdemucs_ft</option>
                    <option value="htdemucs_6s">htdemucs_6s</option>
                    <option value="mdx_extra">mdx_extra</option>
                    <option value="mdx_q">mdx_q</option>
                    <option value="mdx_extra_q">mdx_extra_q</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-xl border bg-muted/15 p-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('voice.transcription')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('voice.transcriptionHint')}
                  </p>
                </div>
                <Switch
                  checked={transcriptionEnabled}
                  onCheckedChange={setTranscriptionEnabled}
                />
              </div>
              {transcriptionEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">
                    <span>Whisper model</span>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2"
                      value={whisperModel}
                      onChange={(event) => setWhisperModel(event.target.value)}
                    >
                      {whisperModels.length ? (
                        whisperModels.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))
                      ) : (
                        <option value="base">
                          {t('voice.noWhisperModel')}
                        </option>
                      )}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span>{t('voice.language')}</span>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2"
                      value={whisperLanguage}
                      onChange={(event) =>
                        setWhisperLanguage(event.target.value)
                      }
                    >
                      <option value="auto">{t('voice.autoLanguage')}</option>
                      <option value="vi">Tiếng Việt</option>
                      <option value="en">English</option>
                      <option value="zh">中文</option>
                    </select>
                  </label>
                  {!transcriptionReady && (
                    <p className="col-span-2 text-xs text-amber-600">
                      {t('voice.whisperRequired')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className={`space-y-3 ${hasVideoOutput ? '' : 'opacity-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('voice.speed', { speed: speed.toFixed(2) })}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('voice.speedHint')}
                  </p>
                </div>
                <Input
                  className="w-24"
                  type="number"
                  min="0.25"
                  max="4"
                  step="0.05"
                  disabled={!hasVideoOutput}
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                />
              </div>
              <input
                className="w-full accent-cyan-600"
                type="range"
                min="0.25"
                max="4"
                step="0.05"
                disabled={!hasVideoOutput}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
              <div className="flex items-center justify-between text-xs">
                <span>{t('voice.keepPitch')}</span>
                <Switch
                  checked={keepPitch}
                  disabled={!hasVideoOutput}
                  onCheckedChange={setKeepPitch}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border">
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-sm font-semibold"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                {t('voice.advanced')}
              </span>
              <span className="text-xs text-muted-foreground">
                {showAdvanced ? t('voice.collapse') : t('voice.expand')}
              </span>
            </button>
            {showAdvanced && (
              <div className="grid gap-3 border-t p-4 md:grid-cols-4">
                <div className="flex gap-2 md:col-span-4">
                  {(['fast', 'balanced', 'best'] as const).map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => applyQualityPreset(preset)}
                    >
                      {preset === 'fast'
                        ? t('voice.fast')
                        : preset === 'best'
                          ? t('voice.best')
                          : t('voice.balanced')}
                    </Button>
                  ))}
                </div>
                <label className="space-y-1 text-xs">
                  <span>Shifts (0-10)</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={demucs.shifts}
                    onChange={(event) =>
                      setDemucs({
                        ...demucs,
                        shifts: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span>Overlap (0.1-0.5)</span>
                  <Input
                    type="number"
                    min="0.1"
                    max="0.5"
                    step="0.05"
                    value={demucs.overlap}
                    onChange={(event) =>
                      setDemucs({
                        ...demucs,
                        overlap: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span>Segment (giây)</span>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="Auto"
                    value={demucs.segment ?? ''}
                    onChange={(event) =>
                      setDemucs({
                        ...demucs,
                        segment: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span>CPU jobs</span>
                  <Input
                    type="number"
                    min="0"
                    max="32"
                    value={demucs.jobs}
                    onChange={(event) =>
                      setDemucs({ ...demucs, jobs: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span>Bit depth</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={demucs.bitDepth}
                    onChange={(event) =>
                      setDemucs({
                        ...demucs,
                        bitDepth: event.target
                          .value as DemucsProcessingOptions['bitDepth'],
                      })
                    }
                  >
                    <option value="int16">int16</option>
                    <option value="int24">int24</option>
                    <option value="float32">float32</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>Clip mode</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={demucs.clipMode}
                    onChange={(event) =>
                      setDemucs({
                        ...demucs,
                        clipMode: event.target
                          .value as DemucsProcessingOptions['clipMode'],
                      })
                    }
                  >
                    <option value="rescale">Rescale</option>
                    <option value="clamp">Clamp</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <div className="flex items-center justify-between rounded-md border px-3 md:col-span-2">
                  <span className="text-xs">{t('voice.keepStems')}</span>
                  <Switch checked={keepStems} onCheckedChange={setKeepStems} />
                </div>
              </div>
            )}
          </div>

          <Button
            className="h-11 w-full bg-gradient-to-r from-cyan-600 to-emerald-600 text-white"
            disabled={
              !runtime?.available ||
              !inputFiles.length ||
              !outputDirectory ||
              !outputs.length ||
              !transcriptionReady ||
              speed < 0.25 ||
              speed > 4 ||
              (device === 'gpu' && !runtime.cudaAvailable)
            }
            onClick={enqueue}
          >
            <Zap className="mr-2 h-4 w-4" />
            {t('voice.enqueue')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            {t('voice.queue')}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {t('voice.jobs', { count: jobs.length })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!jobs.length && (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t('voice.empty')}
            </div>
          )}
          {[...jobs].reverse().map((job) => (
            <div key={job.id} className="rounded-xl border bg-muted/15 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {fileName(job.inputFile)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {job.stageLabel} ·{' '}
                    {job.mode === 'vocals' ? '2 stems' : '4 stems'} ·{' '}
                    {job.device.toUpperCase()} · {job.speed}x · attempt{' '}
                    {job.attempt}
                  </p>
                </div>
                <div className="flex gap-1">
                  {[
                    'queued',
                    'preparing',
                    'separating',
                    'transcribing',
                    'rendering',
                    'validating',
                  ].includes(job.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        window.ipc?.invoke('voice-separation:cancel', job.id)
                      }
                    >
                      <Square className="mr-1 h-3 w-3" />
                      {t('voice.cancel')}
                    </Button>
                  )}
                  {['partial', 'failed', 'cancelled'].includes(job.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        window.ipc?.invoke('voice-separation:retry', job.id)
                      }
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      {t('voice.retry')}
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={job.progress} className="mt-2 h-1.5" />
              {job.error && (
                <p className="mt-2 text-xs text-destructive">
                  {localizedErrorMessage(job.error)}
                </p>
              )}
              {job.deliverables?.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {job.deliverables.map((output) => (
                    <div
                      key={`${output.type}-${output.filePath}`}
                      className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 dark:border-emerald-900 dark:bg-emerald-950/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">{output.type}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {fileName(output.filePath)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            window.ipc?.invoke(
                              'voice-separation:reveal',
                              output.filePath,
                            )
                          }
                        >
                          {t('voice.open')}
                        </Button>
                      </div>
                      {(output.type === 'voice-video' ||
                        output.type === 'karaoke-video') && (
                        <video
                          className="mt-2 max-h-40 w-full rounded bg-black"
                          controls
                          preload="metadata"
                          src={`media://${encodeURIComponent(output.filePath)}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {job.stems.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {job.stems.map((stem) => (
                    <div
                      key={stem.filePath}
                      className="rounded-lg border bg-background p-2"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold capitalize">
                          {stem.type}
                        </span>
                        <button
                          className="text-[10px] text-cyan-600 hover:underline"
                          onClick={() =>
                            window.ipc?.invoke(
                              'voice-separation:reveal',
                              stem.filePath,
                            )
                          }
                        >
                          {t('voice.openFolder')}
                        </button>
                      </div>
                      <audio
                        className="h-8 w-full"
                        controls
                        preload="metadata"
                        src={`media://${encodeURIComponent(stem.filePath)}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
