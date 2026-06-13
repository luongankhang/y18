import type { FfmpegSelectOption } from './FfmpegOptionSelect';
import {
  AUDIO_BITRATES,
  AUDIO_TRACK_OPTIONS,
  CHANNEL_OPTIONS,
  CRF_VALUES,
  ENCODE_PRESETS,
  FPS_OPTIONS,
  HIGH_PASS_OPTIONS,
  RESOLUTION_OPTIONS,
  SAMPLE_RATES,
} from './advancedFieldStyles';

function mapValues(
  values: readonly string[],
  prefix: string,
): FfmpegSelectOption[] {
  return values.map((value) => ({
    value,
    nameKey: `${prefix}.${value}.name`,
    descKey: `${prefix}.${value}.desc`,
  }));
}

export const ENCODE_PRESET_OPTIONS = mapValues(ENCODE_PRESETS, 'encodePreset');
export const CRF_QUALITY_OPTIONS = mapValues(CRF_VALUES, 'crfQuality');
export const AUDIO_FORMAT_OPTIONS = mapValues(
  ['wav', 'mp3', 'aac', 'flac', 'm4a'],
  'audioFormatOption',
);
export const AUDIO_BITRATE_OPTIONS = mapValues(
  AUDIO_BITRATES,
  'audioBitrateOption',
);
export const EXTRACT_SAMPLE_RATE_OPTIONS: FfmpegSelectOption[] = [
  {
    value: '0',
    nameKey: 'extractSampleRateOption.0.name',
    descKey: 'extractSampleRateOption.0.desc',
  },
  ...mapValues(
    SAMPLE_RATES.filter((value) => value !== '0'),
    'extractSampleRateOption',
  ),
];
export const CHANNEL_OPTIONS_LIST: FfmpegSelectOption[] = [
  {
    value: '0',
    nameKey: 'channelOption.0.name',
    descKey: 'channelOption.0.desc',
  },
  ...mapValues(
    CHANNEL_OPTIONS.filter((value) => value !== '0'),
    'channelOption',
  ),
];
export const AUDIO_TRACK_OPTIONS_LIST = mapValues(
  AUDIO_TRACK_OPTIONS,
  'audioTrackOption',
);
export const WHISPER_SAMPLE_RATE_OPTIONS = mapValues(
  ['8000', '16000', '22050', '44100', '48000'],
  'whisperSampleRateOption',
);
export const HIGH_PASS_OPTIONS_LIST: FfmpegSelectOption[] = [
  {
    value: '0',
    nameKey: 'highPassOption.0.name',
    descKey: 'highPassOption.0.desc',
  },
  ...mapValues(
    HIGH_PASS_OPTIONS.filter((value) => value !== '0'),
    'highPassOption',
  ),
];
export const RESOLUTION_OPTIONS_LIST = mapValues(
  RESOLUTION_OPTIONS,
  'resolutionOption',
);
export const FPS_OPTIONS_LIST = mapValues(FPS_OPTIONS, 'fpsOption');
export const OUTPUT_FORMAT_OPTIONS = mapValues(
  ['mp4', 'mkv', 'mov'],
  'outputFormatOption',
);
export const MERGE_AUDIO_MODE_OPTIONS = mapValues(
  ['mix', 'replace'],
  'mergeAudioModeOption',
);

export const SPEED_TIER_OPTIONS = [
  '0.5',
  '0.6',
  '0.7',
  '0.8',
  '0.9',
  '1.0',
  '1.1',
  '1.2',
  '1.3',
  '1.4',
  '1.5',
  '1.6',
  '1.7',
  '1.8',
  '1.9',
  '2.0',
].map((value) => ({
  value,
  nameKey: `speedTierOption.${value.replace('.', '_')}.name`,
  descKey: `speedTierOption.${value.replace('.', '_')}.desc`,
}));
