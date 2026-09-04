export type VoiceSeparationMode = 'vocals' | 'four-stems';
export type VoiceSeparationDevice = 'auto' | 'cpu' | 'gpu';
export type VoiceOutputPreset = 'voice' | 'voice-video' | 'karaoke-video';
export type VoiceBitDepth = 'int16' | 'int24' | 'float32';
export type VoiceClipMode = 'rescale' | 'clamp' | 'none';
export type VoiceSeparationStatus =
  | 'queued'
  | 'preparing'
  | 'separating'
  | 'transcribing'
  | 'rendering'
  | 'validating'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface VoiceStemResult {
  type:
    | 'vocals'
    | 'instrumental'
    | 'drums'
    | 'bass'
    | 'other'
    | 'guitar'
    | 'piano';
  filePath: string;
}

export interface VoiceDeliverable {
  type: VoiceOutputPreset | 'subtitle-srt' | 'transcript-txt';
  filePath: string;
}

export interface DemucsProcessingOptions {
  shifts: number;
  overlap: number;
  segment?: number;
  jobs: number;
  split: boolean;
  bitDepth: VoiceBitDepth;
  clipMode: VoiceClipMode;
}

export interface VoiceTranscriptionOptions {
  enabled: boolean;
  model: string;
  language: string;
}

export interface VoiceSeparationJob {
  id: string;
  inputFile: string;
  outputDirectory: string;
  mode: VoiceSeparationMode;
  modelId: string;
  device: VoiceSeparationDevice;
  outputs: VoiceOutputPreset[];
  speed: number;
  keepPitch: boolean;
  keepStems: boolean;
  demucs: DemucsProcessingOptions;
  transcription: VoiceTranscriptionOptions;
  status: VoiceSeparationStatus;
  progress: number;
  stageLabel: string;
  stems: VoiceStemResult[];
  deliverables: VoiceDeliverable[];
  error?: string;
  warnings?: string[];
  createdAt: number;
  attempt: number;
}

export interface VoiceRuntimeInfo {
  available: boolean;
  pythonPath?: string;
  pythonVersion?: string;
  demucsVersion?: string;
  torchVersion?: string;
  audioBackends?: string[];
  cudaAvailable: boolean;
  nvidiaHardwareAvailable?: boolean;
  nvidiaDriverVersion?: string;
  nvidiaCudaVersion?: string;
  gpuName?: string;
  runtimeSearchPaths?: string[];
  error?: string;
}
