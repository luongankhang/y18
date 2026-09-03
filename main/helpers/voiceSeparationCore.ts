import type {
  VoiceSeparationDevice,
  VoiceSeparationMode,
  VoiceSeparationStatus,
} from '../../types/voiceSeparation';

const transitions: Record<VoiceSeparationStatus, VoiceSeparationStatus[]> = {
  queued: ['preparing', 'cancelled'],
  preparing: ['separating', 'failed', 'cancelled'],
  separating: ['validating', 'failed', 'cancelled'],
  validating: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued'],
  cancelled: ['queued'],
};

export function canTransitionVoiceJob(
  from: VoiceSeparationStatus,
  to: VoiceSeparationStatus,
): boolean {
  return transitions[from].includes(to);
}

export function parseDemucsProgress(line: string): number | null {
  const match = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return Math.min(100, Math.max(0, Number(match[1])));
}

export function buildDemucsArgs(options: {
  mode: VoiceSeparationMode;
  modelId: string;
  device: VoiceSeparationDevice;
  outputDirectory: string;
  inputFile: string;
}): string[] {
  const device = options.device === 'gpu' ? 'cuda' : options.device;
  const args = [
    '-m',
    'demucs',
    '-n',
    options.modelId,
    '-d',
    device,
    '--out',
    options.outputDirectory,
  ];
  if (options.mode === 'vocals') args.push('--two-stems', 'vocals');
  args.push(options.inputFile);
  return args;
}
