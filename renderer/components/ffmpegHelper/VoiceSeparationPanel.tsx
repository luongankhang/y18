import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  FolderOpen,
  Mic2,
  RotateCcw,
  Square,
  Upload,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import type {
  VoiceRuntimeInfo,
  VoiceSeparationDevice,
  VoiceSeparationJob,
  VoiceSeparationMode,
} from '../../../types/voiceSeparation';

interface VoiceSeparationPanelProps {
  onError: (message: string) => void;
}

const fileName = (value: string) => value.split(/[\\/]/).pop() || value;

export function VoiceSeparationPanel({ onError }: VoiceSeparationPanelProps) {
  const [runtime, setRuntime] = useState<VoiceRuntimeInfo | null>(null);
  const [jobs, setJobs] = useState<VoiceSeparationJob[]>([]);
  const [inputFiles, setInputFiles] = useState<string[]>([]);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [mode, setMode] = useState<VoiceSeparationMode>('vocals');
  const [device, setDevice] = useState<VoiceSeparationDevice>('auto');
  const [modelId, setModelId] = useState('htdemucs');
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
      });
      setInputFiles([]);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-cyan-200/60 shadow-xl shadow-cyan-500/5 dark:border-cyan-900/70">
        <CardHeader className="border-b bg-gradient-to-r from-cyan-500/10 to-emerald-500/10">
          <CardTitle className="flex items-center gap-3 text-xl">
            <span className="rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-600 p-2 shadow-lg">
              <Mic2 className="h-5 w-5 text-white" />
            </span>
            Tách giọng hát bằng Demucs
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
                        ? 'Demucs runtime sẵn sàng'
                        : 'Chưa tìm thấy Demucs runtime'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {runtime?.available
                      ? `Python ${runtime.pythonVersion} · Demucs ${runtime.demucsVersion} · Torch ${runtime.torchVersion}${runtime.cudaAvailable ? ` · GPU ${runtime.gpuName || 'CUDA'}` : ' · CPU'}`
                      : 'Cài runtime đóng gói hoặc đặt Y18_DEMUCS_PYTHON tới Python có demucs và torch.'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshRuntime}
                disabled={loadingRuntime}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Kiểm tra lại
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Danh sách nguồn</Label>
              <Button
                variant="outline"
                className="h-24 w-full border-dashed"
                onClick={selectInputs}
              >
                <Upload className="mr-2 h-5 w-5" />
                {inputFiles.length
                  ? `${inputFiles.length} file đã chọn`
                  : 'Chọn nhiều video/audio'}
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
              <Label>Thư mục đầu ra</Label>
              <div className="flex gap-2">
                <Input
                  value={outputDirectory}
                  readOnly
                  placeholder="Chọn thư mục lưu stems"
                />
                <Button variant="outline" size="icon" onClick={selectOutput}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-xs">
                  <span>Chế độ</span>
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
                  <span>Thiết bị</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={device}
                    onChange={(e) =>
                      setDevice(e.target.value as VoiceSeparationDevice)
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="cpu">CPU</option>
                    <option value="gpu" disabled={!runtime?.cudaAvailable}>
                      GPU
                    </option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>Model</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                  >
                    <option value="htdemucs">Balanced</option>
                    <option value="htdemucs_ft">Best quality</option>
                    <option value="mdx_q">Fast</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <Button
            className="h-11 w-full bg-gradient-to-r from-cyan-600 to-emerald-600 text-white"
            disabled={
              !runtime?.available || !inputFiles.length || !outputDirectory
            }
            onClick={enqueue}
          >
            <Zap className="mr-2 h-4 w-4" />
            Thêm vào hàng đợi tách voice
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            Processing queue{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {jobs.length} jobs
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!jobs.length && (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Chưa có tác vụ. Chọn nguồn và thêm vào queue.
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
                    {job.device.toUpperCase()} · attempt {job.attempt}
                  </p>
                </div>
                <div className="flex gap-1">
                  {['queued', 'preparing', 'separating', 'validating'].includes(
                    job.status,
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        window.ipc?.invoke('voice-separation:cancel', job.id)
                      }
                    >
                      <Square className="mr-1 h-3 w-3" />
                      Hủy
                    </Button>
                  )}
                  {['failed', 'cancelled'].includes(job.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        window.ipc?.invoke('voice-separation:retry', job.id)
                      }
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Thử lại
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={job.progress} className="mt-2 h-1.5" />
              {job.error && (
                <p className="mt-2 text-xs text-destructive">{job.error}</p>
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
                          Mở thư mục
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
