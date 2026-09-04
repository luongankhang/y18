import type {
  VoiceSeparationDevice,
  VoiceSeparationMode,
  VoiceSeparationStatus,
  DemucsProcessingOptions,
} from '../../types/voiceSeparation';

const transitions: Record<VoiceSeparationStatus, VoiceSeparationStatus[]> = {
  queued: ['preparing', 'cancelled'],
  preparing: ['separating', 'failed', 'cancelled'],
  separating: [
    'transcribing',
    'rendering',
    'validating',
    'failed',
    'partial',
    'cancelled',
  ],
  transcribing: ['rendering', 'validating', 'failed', 'partial', 'cancelled'],
  rendering: ['validating', 'failed', 'partial', 'cancelled'],
  validating: ['completed', 'failed', 'cancelled'],
  completed: [],
  partial: ['queued'],
  failed: ['queued'],
  cancelled: ['queued'],
};

export function canTransitionVoiceJob(
  from: VoiceSeparationStatus,
  to: VoiceSeparationStatus,
): boolean {
  return transitions[from].includes(to);
}

/** Keep queued jobs deterministic even after the queue is restored from disk. */
export function sortVoiceJobsForQueue<
  T extends { createdAt: number; id: string },
>(jobs: T[]): T[] {
  return [...jobs].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

export function parseDemucsProgress(line: string): number | null {
  const match = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return Math.min(100, Math.max(0, Number(match[1])));
}

export function parseNvidiaSmiQueryOutput(stdout: string) {
  const line = stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return null;
  const [gpuName, driverVersion] = line.split(/,\s*/, 2);
  if (!gpuName) return null;
  return {
    gpuName,
    driverVersion: driverVersion || undefined,
  };
}

export function parseNvidiaSmiCudaVersion(stdout: string) {
  return (
    stdout.match(/CUDA\s+(?:UMD\s+)?Version:\s*([0-9.]+)/i)?.[1] ||
    stdout.match(/CUDA Version:\s*([0-9.]+)/i)?.[1]
  );
}

export function buildDemucsArgs(options: {
  mode: VoiceSeparationMode;
  modelId: string;
  device: VoiceSeparationDevice;
  outputDirectory: string;
  inputFile: string;
  processing?: DemucsProcessingOptions;
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
  const processing = options.processing;
  if (processing) {
    args.push(
      '--shifts',
      String(processing.shifts),
      '--overlap',
      String(processing.overlap),
      '--jobs',
      String(processing.jobs),
      '--clip-mode',
      processing.clipMode,
    );
    if (!processing.split) args.push('--no-split');
    else if (processing.segment !== undefined)
      args.push('--segment', String(processing.segment));
    if (processing.bitDepth === 'int24') args.push('--int24');
    if (processing.bitDepth === 'float32') args.push('--float32');
  }
  if (options.mode === 'vocals') args.push('--two-stems', 'vocals');
  args.push(options.inputFile);
  return args;
}

export function validateVoiceSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4)
    throw new Error('VOICE_SPEED_INVALID');
  return speed;
}

export function validateDemucsProcessingOptions(
  options: DemucsProcessingOptions,
) {
  if (
    !Number.isInteger(options.shifts) ||
    options.shifts < 0 ||
    options.shifts > 10
  )
    throw new Error('VOICE_SHIFTS_INVALID');
  if (
    !Number.isFinite(options.overlap) ||
    options.overlap < 0.1 ||
    options.overlap > 0.5
  )
    throw new Error('VOICE_OVERLAP_INVALID');
  if (!Number.isInteger(options.jobs) || options.jobs < 0 || options.jobs > 32)
    throw new Error('VOICE_JOBS_INVALID');
  if (
    options.segment !== undefined &&
    (!Number.isInteger(options.segment) ||
      options.segment < 1 ||
      options.segment > 60)
  )
    throw new Error('VOICE_SEGMENT_INVALID');
  return options;
}

export function buildVoiceTempoFilter(speed: number, keepPitch: boolean) {
  validateVoiceSpeed(speed);
  if (!keepPitch) return `asetrate=44100*${speed},aresample=44100`;
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining}`);
  return filters.join(',');
}

export function buildStemVideoArgs(options: {
  inputFile: string;
  stemFile: string;
  outputFile: string;
  speed: number;
  keepPitch: boolean;
  outputDurationSec?: number;
}) {
  validateVoiceSpeed(options.speed);
  const outputDuration = options.outputDurationSec;
  if (
    outputDuration !== undefined &&
    (!Number.isFinite(outputDuration) || outputDuration <= 0)
  ) {
    throw new Error('VOICE_DURATION_INVALID');
  }
  const audioFilter = buildVoiceTempoFilter(options.speed, options.keepPitch);
  const normalizedAudioFilter = outputDuration
    ? `${audioFilter},apad,atrim=duration=${outputDuration},asetpts=PTS-STARTPTS`
    : audioFilter;
  return [
    '-y',
    '-i',
    options.inputFile,
    '-i',
    options.stemFile,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-vf',
    `setpts=${1 / options.speed}*PTS`,
    '-af',
    normalizedAudioFilter,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    ...(outputDuration ? ['-t', String(outputDuration)] : []),
    '-movflags',
    '+faststart',
    options.outputFile,
  ];
}
