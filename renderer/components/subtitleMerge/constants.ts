/**
 * 字幕合并功能常量和预设样式
 */

import type {
  SubtitleStyle,
  StylePreset,
  SubtitleBlurMask,
  VideoExportSettings,
  CustomTextOverlay,
} from '../../../types/subtitleMerge';

/**
 * 默认字幕样式
 */
export const DEFAULT_STYLE: SubtitleStyle = {
  fontName: 'Arial',
  fontSize: 24,
  primaryColor: '#FFFFFF',
  secondaryColor: '#FFFF00',
  outlineColor: '#000000',
  backColor: '#000000',
  primaryAlpha: 0,
  outlineAlpha: 0,
  backAlpha: 128,
  bold: false,
  italic: false,
  underline: false,
  strikeOut: false,
  borderStyle: 1,
  outline: 2,
  shadow: 1,
  scaleX: 100,
  scaleY: 100,
  letterSpacing: 0,
  angle: 0,
  lineHeight: 1.4,
  wrapStyle: 1,
  alignment: 2,
  marginL: 28,
  marginR: 28,
  marginV: 28,
};

/** 默认自定义文字叠加（如频道名水印） */
export const DEFAULT_CUSTOM_TEXT_OVERLAY: CustomTextOverlay = {
  enabled: false,
  text: '',
  posXPercent: 95,
  posYPercent: 5,
  alignment: 9,
  fontName: 'Arial',
  fontSize: 22,
  primaryColor: '#FFFFFF',
  outlineColor: '#000000',
  outline: 2,
  shadow: 1,
  bold: true,
  italic: false,
  underline: false,
  strikeOut: false,
  borderStyle: 1,
  backColor: '#000000',
  scaleX: 100,
  scaleY: 100,
  letterSpacing: 0,
  angle: 0,
  marginL: 32,
  marginR: 32,
  marginV: 28,
};

function presetStyle(overrides: Partial<SubtitleStyle>): SubtitleStyle {
  return { ...DEFAULT_STYLE, ...overrides };
}

/**
 * 预设样式列表
 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'classic',
    name: '经典白字黑边',
    nameKey: 'presetClassic',
    style: presetStyle({}),
  },
  {
    id: 'movie',
    name: '电影字幕',
    nameKey: 'presetMovie',
    style: presetStyle({
      fontName: 'Georgia',
      fontSize: 28,
      primaryColor: '#FFFFC8',
      outline: 2,
      shadow: 2,
      marginL: 30,
      marginR: 30,
      marginV: 30,
    }),
  },
  {
    id: 'youtube',
    name: 'YouTube风格',
    nameKey: 'presetYoutube',
    style: presetStyle({
      fontName: 'Roboto',
      fontSize: 22,
      borderStyle: 3,
      outline: 0,
      shadow: 0,
      backAlpha: 180,
      marginV: 15,
    }),
  },
  {
    id: 'clean',
    name: '清新简约',
    nameKey: 'presetClean',
    style: presetStyle({
      fontName: 'Helvetica Neue',
      fontSize: 22,
      outlineColor: '#333333',
      outline: 1,
      shadow: 0,
      marginV: 25,
    }),
  },
  {
    id: 'bold_impact',
    name: '醒目加粗',
    nameKey: 'presetBoldImpact',
    style: presetStyle({
      fontName: 'Impact',
      fontSize: 26,
      primaryColor: '#FFFF00',
      bold: true,
      outline: 3,
      shadow: 2,
    }),
  },
  {
    id: 'neon',
    name: '霓虹发光',
    nameKey: 'presetNeon',
    style: presetStyle({
      fontName: 'Segoe UI',
      fontSize: 26,
      primaryColor: '#00FFFF',
      secondaryColor: '#FF00FF',
      outlineColor: '#0044AA',
      backColor: '#001133',
      bold: true,
      outline: 2,
      shadow: 3,
      scaleX: 105,
      letterSpacing: 1,
    }),
  },
  {
    id: 'anime',
    name: '动漫风格',
    nameKey: 'presetAnime',
    style: presetStyle({
      fontName: 'Arial',
      fontSize: 24,
      primaryColor: '#FFFFFF',
      outlineColor: '#FF4488',
      backColor: '#220011',
      bold: true,
      outline: 3,
      shadow: 1,
      scaleY: 110,
      marginV: 28,
    }),
  },
  {
    id: 'documentary',
    name: '纪录片',
    nameKey: 'presetDocumentary',
    style: presetStyle({
      fontName: 'Helvetica Neue',
      fontSize: 20,
      primaryColor: '#F5F5F5',
      outlineColor: '#1A1A1A',
      italic: true,
      outline: 1,
      shadow: 0,
      letterSpacing: 0.5,
      lineHeight: 1.5,
      marginL: 40,
      marginR: 40,
      marginV: 35,
    }),
  },
  {
    id: 'karaoke',
    name: '卡拉OK高亮',
    nameKey: 'presetKaraoke',
    style: presetStyle({
      fontName: 'Arial',
      fontSize: 28,
      primaryColor: '#FFFFFF',
      secondaryColor: '#FFD700',
      outlineColor: '#000000',
      bold: true,
      outline: 2,
      scaleX: 102,
    }),
  },
];

/**
 * 常用字体列表
 */
export const FONT_LIST = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Helvetica Neue', label: 'Helvetica Neue' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Palatino Linotype', label: 'Palatino' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
  { value: 'Microsoft YaHei', label: 'Microsoft YaHei' },
  { value: 'SimHei', label: 'SimHei' },
  { value: 'SimSun', label: 'SimSun' },
  { value: 'KaiTi', label: 'KaiTi' },
  { value: 'PingFang SC', label: 'PingFang SC' },
  { value: 'Noto Sans SC', label: 'Noto Sans SC' },
  { value: 'Source Han Sans SC', label: 'Source Han Sans SC' },
];

export const FONT_SIZE_RANGE = {
  min: 12,
  max: 72,
  default: 24,
};

export const OUTLINE_RANGE = {
  min: 0,
  max: 10,
  default: 2,
};

export const SHADOW_RANGE = {
  min: 0,
  max: 10,
  default: 1,
};

export const MARGIN_RANGE = {
  min: 0,
  max: 200,
  default: 20,
};

export const SCALE_RANGE = {
  min: 50,
  max: 200,
  default: 100,
};

export const LETTER_SPACING_RANGE = {
  min: -5,
  max: 20,
  default: 0,
};

export const ANGLE_RANGE = {
  min: -45,
  max: 45,
  default: 0,
};

export const LINE_HEIGHT_RANGE = {
  min: 0.8,
  max: 2.5,
  default: 1.4,
  step: 0.1,
};

export const ALPHA_RANGE = {
  min: 0,
  max: 255,
  default: 0,
};

export const WRAP_STYLE_OPTIONS = [
  { value: 0, labelKey: 'wrapStyleSmart' },
  { value: 1, labelKey: 'wrapStyleEnd' },
  { value: 2, labelKey: 'wrapStyleNone' },
  { value: 3, labelKey: 'wrapStyleSmart2' },
] as const;

export const BORDER_STYLE_OPTIONS = [
  { value: 1, label: '边框+阴影', labelKey: 'borderStyleOutline' },
  { value: 3, label: '背景框', labelKey: 'borderStyleBox' },
];

export const DEFAULT_BLUR_MASK: SubtitleBlurMask = {
  enabled: false,
  xPercent: 5,
  yPercent: 78,
  widthPercent: 90,
  heightPercent: 18,
  strength: 12,
};

export const BLUR_MASK_RANGE = {
  position: { min: 0, max: 95 },
  size: { min: 5, max: 100 },
  strength: { min: 1, max: 30, default: 12 },
};

export const CUSTOM_POS_RANGE = {
  min: 0,
  max: 100,
};

export const DEFAULT_EXPORT_SETTINGS: VideoExportSettings = {
  resolutionPreset: 'source',
  customWidth: 1920,
  customHeight: 1080,
  fpsMode: 'source',
  customFps: 30,
  renderMode: 'cpu',
};

export const RESOLUTION_PRESETS = [
  { value: 'source' as const, labelKey: 'resolutionSource' },
  { value: '3840x2160' as const, labelKey: 'resolution4k' },
  { value: '2560x1440' as const, labelKey: 'resolution1440p' },
  { value: '1920x1080' as const, labelKey: 'resolution1080p' },
  { value: '1280x720' as const, labelKey: 'resolution720p' },
  { value: '854x480' as const, labelKey: 'resolution480p' },
  { value: 'custom' as const, labelKey: 'resolutionCustom' },
];

export const FPS_PRESETS = [
  { value: 'source' as const, labelKey: 'fpsSource' },
  { value: 24, labelKey: 'fps24' },
  { value: 25, labelKey: 'fps25' },
  { value: 30, labelKey: 'fps30' },
  { value: 50, labelKey: 'fps50' },
  { value: 60, labelKey: 'fps60' },
  { value: 'custom' as const, labelKey: 'fpsCustom' },
];

export const CUSTOM_RESOLUTION_RANGE = {
  width: { min: 320, max: 7680 },
  height: { min: 240, max: 4320 },
};

export const CUSTOM_FPS_RANGE = {
  min: 1,
  max: 60,
  default: 30,
};
