export type VoiceSeparationMode = 'vocals' | 'four-stems';
export type VoiceSeparationDevice = 'auto' | 'cpu' | 'gpu';
export type VoiceSeparationStatus =
  | 'queued'
  | 'preparing'
  | 'separating'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface VoiceStemResult {
  type: 'vocals' | 'instrumental' | 'drums' | 'bass' | 'other';
  filePath: string;
}

export interface VoiceSeparationJob {
  id: string;
  inputFile: string;
  outputDirectory: string;
  mode: VoiceSeparationMode;
  modelId: string;
  device: VoiceSeparationDevice;
  status: VoiceSeparationStatus;
  progress: number;
  stageLabel: string;
  stems: VoiceStemResult[];
  error?: string;
  createdAt: number;
  attempt: number;
}

export interface VoiceRuntimeInfo {
  available: boolean;
  pythonPath?: string;
  pythonVersion?: string;
  demucsVersion?: string;
  torchVersion?: string;
  cudaAvailable: boolean;
  gpuName?: string;
  error?: string;
}
