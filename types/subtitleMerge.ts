/**
 * 字幕合并功能相关类型定义
 */

/**
 * 字幕对齐位置 (numpad 风格的 9 宫格)
 * 7=左上, 8=中上, 9=右上
 * 4=左中, 5=居中, 6=右中
 * 1=左下, 2=中下, 3=右下
 */
export type SubtitleAlignment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * 边框样式
 * 1 = 边框 + 阴影
 * 3 = 不透明背景框
 */
export type BorderStyle = 1 | 3;

/** ASS WrapStyle: 0=智能 1=行尾 2=不换行 3=更智能 */
export type WrapStyle = 0 | 1 | 2 | 3;

/**
 * 字幕样式配置
 * 所有颜色使用 CSS 格式 (#RRGGBB 或 rgba)
 */
export interface SubtitleStyle {
  /** 字体名称 */
  fontName: string;
  /** 字体大小 (10-72) */
  fontSize: number;
  /** 主要颜色 (CSS 格式) */
  primaryColor: string;
  /** 次要颜色 (卡拉OK/高亮) */
  secondaryColor: string;
  /** 边框颜色 (CSS 格式) */
  outlineColor: string;
  /** 背景/阴影颜色 (CSS 格式) */
  backColor: string;
  /** 主色透明度 ASS alpha (0=不透明, 255=全透明) */
  primaryAlpha: number;
  /** 边框色透明度 */
  outlineAlpha: number;
  /** 背景色透明度 */
  backAlpha: number;
  /** 是否加粗 */
  bold: boolean;
  /** 是否斜体 */
  italic: boolean;
  /** 是否下划线 */
  underline: boolean;
  /** 是否删除线 */
  strikeOut: boolean;
  /** 边框样式 */
  borderStyle: BorderStyle;
  /** 边框宽度 (0-10) */
  outline: number;
  /** 阴影距离 (0-10) */
  shadow: number;
  /** 水平缩放 (50-200, 100=正常) */
  scaleX: number;
  /** 垂直缩放 (50-200, 100=正常) */
  scaleY: number;
  /** 字间距 (ASS Spacing) */
  letterSpacing: number;
  /** 旋转角度 (度) */
  angle: number;
  /** 行高 (预览用) */
  lineHeight: number;
  /** 换行策略 */
  wrapStyle: WrapStyle;
  /** 对齐位置 */
  alignment: SubtitleAlignment;
  /** 左边距 (px) */
  marginL: number;
  /** 右边距 (px) */
  marginR: number;
  /** 上下边距 (px) */
  marginV: number;
}

/**
 * 自定义文字叠加（如水印、频道名），与字幕文件无关
 */
export interface CustomTextOverlay {
  /** 是否启用 */
  enabled: boolean;
  /** 叠加文字内容 */
  text: string;
  /** X 位置 (0-100%，相对视频宽度) */
  posXPercent: number;
  /** Y 位置 (0-100%，相对视频高度) */
  posYPercent: number;
  /** 锚点对齐（决定 pos 点的参考角） */
  alignment: SubtitleAlignment;
  /** 字体名称 */
  fontName: string;
  /** 字号 */
  fontSize: number;
  /** 文字颜色 */
  primaryColor: string;
  /** 描边颜色 */
  outlineColor: string;
  /** 描边宽度 */
  outline: number;
  /** 阴影距离 */
  shadow: number;
  /** 加粗 */
  bold: boolean;
  /** 斜体 */
  italic: boolean;
  /** 下划线 */
  underline: boolean;
  /** 删除线 */
  strikeOut: boolean;
  /** 边框样式 */
  borderStyle: BorderStyle;
  /** 背景/阴影颜色 */
  backColor: string;
  /** 水平缩放 (50-200) */
  scaleX: number;
  /** 垂直缩放 (50-200) */
  scaleY: number;
  /** 字间距 */
  letterSpacing: number;
  /** 旋转角度 (度) */
  angle: number;
  /** 左边距 (px，距视频边缘) */
  marginL: number;
  /** 右边距 (px) */
  marginR: number;
  /** 上下边距 (px) */
  marginV: number;
}

/** 合并页可编辑字幕 cue */
export interface MergeCue {
  id: string;
  startEndTime: string;
  text: string;
  startTimeInSeconds: number;
  endTimeInSeconds: number;
}

/**
 * 预设样式配置
 */
export interface StylePreset {
  /** 预设 ID */
  id: string;
  /** 预设名称 */
  name: string;
  /** 国际化 key */
  nameKey: string;
  /** 样式配置 */
  style: SubtitleStyle;
}

/**
 * 模糊遮罩配置（用于遮盖视频内嵌原字幕）
 * 位置与尺寸均按视频分辨率百分比表示
 */
export interface SubtitleBlurMask {
  /** 是否启用模糊遮罩 */
  enabled: boolean;
  /** 遮罩左上角 X 位置 (0-100%) */
  xPercent: number;
  /** 遮罩左上角 Y 位置 (0-100%) */
  yPercent: number;
  /** 遮罩宽度 (0-100%) */
  widthPercent: number;
  /** 遮罩高度 (0-100%) */
  heightPercent: number;
  /** 模糊强度 (1-30) */
  strength: number;
}

/**
 * 合并配置
 */
export interface MergeConfig {
  /** 视频文件路径 */
  videoPath: string;
  /** 字幕文件路径 */
  subtitlePath: string;
  /** 输出文件路径 */
  outputPath: string;
  /** 字幕样式 */
  style: SubtitleStyle;
  /** 模糊遮罩（可选） */
  blurMask?: SubtitleBlurMask;
  /** 自定义文字叠加（如水印、频道名） */
  customTextOverlay?: CustomTextOverlay;
  /** 导出分辨率 / FPS 设置 */
  exportSettings?: VideoExportSettings;
}

export type TimelineTrackType = 'video' | 'audio' | 'subtitle';
export type SubtitleTimingMode = 'absolute' | 'linked-video' | 'playhead';

export const TIMELINE_SCHEMA_VERSION = 2;

export interface TimelineTransform {
  /** Normalized canvas coordinates, where 0..1 is the project viewport. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  mirrorX: boolean;
  flipY: boolean;
  opacity: number;
}

export interface TimelineAsset {
  id: string;
  sourceFile: string;
  kind: 'video' | 'audio' | 'image' | 'subtitle' | 'unknown';
  duration?: number;
  width?: number;
  height?: number;
  probeStatus?: 'unknown' | 'ready' | 'error';
}

export interface TimelineEffect {
  id: string;
  type: 'blur';
  startTime: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  blurAmount: number;
  feather: number;
}

export interface TimelineSubtitleCue {
  id: string;
  text: string;
  sourceStartSec: number;
  sourceEndSec: number;
  style?: Partial<SubtitleStyle>;
  position?: { x: number; y: number };
}

export interface TimelineClip {
  id: string;
  /** Stable asset reference added by the versioned project migration. */
  assetId?: string;
  /** Track ownership is explicit after migration; legacy projects infer it. */
  trackId?: string;
  type?: TimelineTrackType;
  source: string;
  sourceFile: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  /** Source playback speed. A 2x clip occupies half its source duration. */
  playbackRate?: number;
  volume: number;
  /** Clip-local visual transforms. Optional for backwards-compatible project loading. */
  mirrorX?: boolean;
  flipY?: boolean;
  transform?: TimelineTransform;
  effects?: TimelineEffect[];
  metadata?: {
    generator?: string;
    modelId?: string;
    text?: string;
    mode?: string;
    language?: string;
    speed?: number;
    instruction?: string;
    referenceAudio?: string;
    subtitleCueId?: string;
    subtitleStartTime?: number;
    subtitleEndTime?: number;
    generatedAt?: number;
  };
  position?: { x: number; y: number; width?: number; height?: number };
  subtitleCues?: TimelineSubtitleCue[];
  subtitleTimingMode?: SubtitleTimingMode;
  linkedVideoClipId?: string;
}

export interface TimelineTrack {
  id: string;
  type: TimelineTrackType;
  name: string;
  order: number;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  volume: number;
  clips: TimelineClip[];
}

export interface TimelineProject {
  schemaVersion?: number;
  duration: number;
  currentTime: number;
  tracks: TimelineTrack[];
  assets?: Record<string, TimelineAsset>;
  subtitleStyle?: SubtitleStyle;
  blurMask?: SubtitleBlurMask;
  customTextOverlay?: CustomTextOverlay;
}

export interface TimelineExportConfig {
  project: TimelineProject;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  subtitleStyle?: SubtitleStyle;
  blurMask?: SubtitleBlurMask;
  renderMode?: 'cpu' | 'gpu';
}

/**
 * 合并状态
 */
export type MergeStatus = 'idle' | 'processing' | 'completed' | 'error';

/**
 * 合并进度信息
 */
export interface MergeProgress {
  /** 进度百分比 (0-100) */
  percent: number;
  /** 当前处理时间点 */
  timeMark: string;
  /** 目标文件大小 (KB) */
  targetSize: number;
  /** 当前状态 */
  status: MergeStatus;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 视频信息
 */
export interface VideoInfo {
  /** 视频路径 */
  path: string;
  /** 文件名 */
  fileName: string;
  /** 时长 (秒) */
  duration: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 文件大小 (bytes) */
  size: number;
  /** 帧率 */
  fps: number;
}

/**
 * 导出分辨率预设
 */
export type ResolutionPreset =
  | 'source'
  | '3840x2160'
  | '2560x1440'
  | '1920x1080'
  | '1280x720'
  | '854x480'
  | 'custom';

/**
 * 视频导出设置
 */
export interface VideoExportSettings {
  /** 分辨率预设 */
  resolutionPreset: ResolutionPreset;
  /** 自定义宽度 */
  customWidth: number;
  /** 自定义高度 */
  customHeight: number;
  /** FPS 模式：跟随源视频或自定义 */
  fpsMode: 'source' | 'custom';
  /** 自定义 FPS */
  customFps: number;
  /** Video encoder mode for timeline export. */
  renderMode: 'cpu' | 'gpu';
}

/**
 * 字幕文件信息
 */
export interface SubtitleInfo {
  /** 字幕路径 */
  path: string;
  /** 文件名 */
  fileName: string;
  /** 字幕条数 */
  count: number;
  /** 格式 (srt, ass, vtt) */
  format: string;
}

/**
 * IPC 响应格式
 */
export interface SubtitleMergeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
