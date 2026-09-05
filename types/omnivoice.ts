export type OmniVoiceMode = 'auto' | 'design' | 'clone';
export type OmniVoiceDevice = 'cuda' | 'cpu';

export interface OmniVoiceTimings {
  worker_start_ms: number;
  python_import_ms: number;
  torch_import_ms: number;
  model_load_ms: number;
  voice_prompt_prepare_ms: number;
  generate_ms: number;
  wav_write_ms: number;
  ffprobe_ms: number;
  total_ms: number;
}

export interface OmniVoiceWorkerRuntime {
  pid: number;
  modelId: string;
  device: string;
  dtype: string;
  gpu?: string;
  pythonExecutable: string;
  pythonVersion: string;
  torchVersion: string;
  torchCudaRuntime?: string;
  cudaAvailable: boolean;
  cudaCount: number;
  capability?: number[];
  vramBytes?: number;
  modelLoadCount: number;
  modelInstanceId: number;
  workerUptimeMs: number;
}

export interface OmniVoiceRuntimeInfo {
  available: boolean;
  pythonPath?: string;
  pythonVersion?: string;
  omnivoiceVersion?: string;
  torchVersion?: string;
  torchCudaVersion?: string;
  cudaAvailable: boolean;
  gpuName?: string;
  modelId: string;
  modelCachePath?: string;
  error?: string;
}

export interface OmniVoiceTtsRequest {
  text: string;
  mode: OmniVoiceMode;
  language?: string;
  instruction?: string;
  referenceAudio?: string;
  referenceTranscript?: string;
  speed?: number;
  numStep?: 16 | 32;
  device?: OmniVoiceDevice;
  seed?: number;
  outputDirectory?: string;
}

export interface OmniVoiceBatchItem {
  id: string;
  text: string;
}

export interface OmniVoiceBatchRequest
  extends Omit<OmniVoiceTtsRequest, 'text'> {
  items: OmniVoiceBatchItem[];
  batchSize?: number;
}

export interface OmniVoiceGeneratedAudio {
  itemId?: string;
  text?: string;
  outputPath: string;
  duration: number;
  sampleRate: number;
  waveform: number[];
}

export interface OmniVoiceJob {
  id: string;
  status:
    | 'queued'
    | 'starting_worker'
    | 'loading_model'
    | 'warming_up'
    | 'preparing_voice'
    | 'generating'
    | 'writing_audio'
    | 'completed'
    | 'cancelled'
    | 'failed';
  text: string;
  outputPath?: string;
  duration?: number;
  sampleRate?: number;
  waveform?: number[];
  outputs?: OmniVoiceGeneratedAudio[];
  timings?: OmniVoiceTimings;
  runtime?: OmniVoiceWorkerRuntime;
  progress?: { completed: number; total: number };
  error?: string;
  createdAt: number;
}
