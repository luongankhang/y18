import React from 'react';
import { FfmpegOptionSelect } from './FfmpegOptionSelect';
import {
  CRF_QUALITY_OPTIONS,
  ENCODE_PRESET_OPTIONS,
} from './ffmpegSelectOptions';

type PresetSelectProps = Omit<
  React.ComponentProps<typeof FfmpegOptionSelect>,
  'options'
>;

export function EncodePresetSelect(props: PresetSelectProps) {
  return <FfmpegOptionSelect {...props} options={ENCODE_PRESET_OPTIONS} />;
}

export function CrfQualitySelect(props: PresetSelectProps) {
  return <FfmpegOptionSelect {...props} options={CRF_QUALITY_OPTIONS} />;
}
