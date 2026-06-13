/**
 * 字幕合并核心逻辑
 * 使用 fluent-ffmpeg 实现字幕烧录到视频
 */

import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logMessage } from './storeManager';
import { timemarkToSeconds } from './fileUtils';
import type {
  SubtitleStyle,
  SubtitleBlurMask,
  VideoExportSettings,
  MergeConfig,
  MergeProgress,
  VideoInfo,
  SubtitleAlignment,
  CustomTextOverlay,
} from '../../types/subtitleMerge';
import {
  detectSubtitleFormat,
  parseSubtitleEntries,
  serializeSubtitleEntries,
  formatAssTime,
  type SubtitleFormat,
} from './subtitleFormats';
import { wrapSubtitleTextForVideo } from './subtitleTextWrap';

// 设置 ffmpeg 路径
const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * 将前端 numpad 风格的 Alignment 转换为 ASS/SSA 格式
 *
 * 前端 numpad 风格 (我们使用的):
 * 7=左上, 8=中上, 9=右上
 * 4=左中, 5=居中, 6=右中
 * 1=左下, 2=中下, 3=右下
 *
 * ASS/SSA 格式 (FFmpeg libass 使用的):
 * 底部行: 1=左下, 2=中下, 3=右下
 * 中间行: 9=左中, 10=居中, 11=右中
 * 顶部行: 5=左上, 6=中上, 7=右上
 */
function convertAlignment(numpadAlignment: SubtitleAlignment): number {
  const alignmentMap: Record<SubtitleAlignment, number> = {
    // 底部行 (保持不变)
    1: 1, // 左下 -> 1
    2: 2, // 中下 -> 2
    3: 3, // 右下 -> 3
    // 中间行
    4: 9, // 左中 -> 9
    5: 10, // 居中 -> 10
    6: 11, // 右中 -> 11
    // 顶部行
    7: 5, // 左上 -> 5
    8: 6, // 中上 -> 6
    9: 7, // 右上 -> 7
  };
  return alignmentMap[numpadAlignment] || 2;
}

/**
 * 将 CSS 颜色转换为 ASS 颜色格式
 * CSS: #RRGGBB 或 rgba(r, g, b, a)
 * ASS: &HAABBGGRR (Alpha, Blue, Green, Red)
 */
export function cssColorToAss(cssColor: string, alpha: number = 0): string {
  let r: number, g: number, b: number;

  if (cssColor.startsWith('#')) {
    // 处理 #RRGGBB 格式
    const hex = cssColor.slice(1);
    r = parseInt(hex.substr(0, 2), 16);
    g = parseInt(hex.substr(2, 2), 16);
    b = parseInt(hex.substr(4, 2), 16);
  } else if (cssColor.startsWith('rgb')) {
    // 处理 rgba(r, g, b, a) 格式
    const match = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    } else {
      // 默认白色
      r = 255;
      g = 255;
      b = 255;
    }
  } else {
    // 默认白色
    r = 255;
    g = 255;
    b = 255;
  }

  // 转换为 ASS 格式: &HAABBGGRR
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  const blueHex = b.toString(16).padStart(2, '0').toUpperCase();
  const greenHex = g.toString(16).padStart(2, '0').toUpperCase();
  const redHex = r.toString(16).padStart(2, '0').toUpperCase();

  return `&H${alphaHex}${blueHex}${greenHex}${redHex}`;
}

/**
 * 构建 force_style 参数字符串
 */
export function buildForceStyle(style: SubtitleStyle): string {
  const parts: string[] = [];

  // 字体设置
  parts.push(`FontName=${style.fontName}`);
  parts.push(`FontSize=${style.fontSize}`);

  // 颜色设置 (ASS 格式)
  parts.push(
    `PrimaryColour=${cssColorToAss(style.primaryColor, style.primaryAlpha ?? 0)}`,
  );
  parts.push(
    `SecondaryColour=${cssColorToAss(style.secondaryColor ?? style.primaryColor, 0)}`,
  );
  parts.push(
    `OutlineColour=${cssColorToAss(style.outlineColor, style.outlineAlpha ?? 0)}`,
  );
  parts.push(
    `BackColour=${cssColorToAss(style.backColor, style.backAlpha ?? 128)}`,
  );

  // 字体样式
  if (style.bold) parts.push('Bold=1');
  if (style.italic) parts.push('Italic=1');
  if (style.underline) parts.push('Underline=1');
  if (style.strikeOut) parts.push('StrikeOut=1');

  // 边框和阴影
  parts.push(`BorderStyle=${style.borderStyle}`);
  parts.push(`Outline=${style.outline}`);
  parts.push(`Shadow=${style.shadow}`);
  parts.push(`ScaleX=${style.scaleX ?? 100}`);
  parts.push(`ScaleY=${style.scaleY ?? 100}`);
  parts.push(`Spacing=${style.letterSpacing ?? 0}`);
  parts.push(`Angle=${style.angle ?? 0}`);

  // 对齐位置 (转换为 ASS 格式)
  const assAlignment = convertAlignment(style.alignment);
  parts.push(`Alignment=${assAlignment}`);

  // 边距
  parts.push(`MarginL=${style.marginL}`);
  parts.push(`MarginR=${style.marginR}`);
  parts.push(`MarginV=${style.marginV}`);
  parts.push(`WrapStyle=${style.wrapStyle ?? 1}`);

  return parts.join(',');
}

/**
 * 转义字幕文件路径以用于 FFmpeg 滤镜
 * Windows 路径需要特殊处理
 */
export function escapeSubtitlePath(subtitlePath: string): string {
  // 将反斜杠转换为正斜杠
  let escaped = subtitlePath.replace(/\\/g, '/');
  // 转义特殊字符: : ' [
  // 注意: 先转义 : 和 [，再转义 '（避免引入的 \ 被重复转义）
  // 此时路径中不应有反斜杠（已全部转为正斜杠），所以不需要转义 \
  escaped = escaped
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/'/g, "\\'");
  return escaped;
}

/**
 * 将字幕文件复制到临时目录，使用安全的文件名（无特殊字符）
 * 返回临时文件路径。调用方需要在使用完毕后清理临时文件。
 *
 * 这是处理包含特殊字符（如单引号 ' ）路径的最可靠方式，
 * 因为 ffmpeg 的滤镜字符串解析在不同版本和不同库封装下行为可能不一致。
 */
export function createSafeSubtitleCopy(subtitlePath: string): string {
  const ext = path.extname(subtitlePath);
  const tmpDir = path.join(os.tmpdir(), 'video-subtitle-master');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const safeName = `subtitle_${Date.now()}${ext}`;
  const tmpPath = path.join(tmpDir, safeName);
  fs.copyFileSync(subtitlePath, tmpPath);
  logMessage(`创建临时字幕文件: ${tmpPath}`, 'info');
  return tmpPath;
}

/**
 * 清理临时字幕文件
 */
export function cleanupTempSubtitle(tmpPath: string): void {
  try {
    if (tmpPath.includes('video-subtitle-master') && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
      logMessage(`清理临时字幕文件: ${tmpPath}`, 'info');
    }
  } catch (err) {
    logMessage(`清理临时文件失败: ${err}`, 'warning');
  }
}

/**
 * 判断路径是否包含需要特殊处理的字符
 */
function pathNeedsSafeCopy(filePath: string): boolean {
  // 包含单引号、反斜杠（非路径分隔符）、冒号（非Windows盘符）等特殊字符
  return /['\[\];,]/.test(filePath);
}

function getBlurRegionPixels(
  blurMask: SubtitleBlurMask,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number; w: number; h: number } {
  const x = Math.round((videoWidth * blurMask.xPercent) / 100);
  const y = Math.round((videoHeight * blurMask.yPercent) / 100);
  const w = Math.max(2, Math.round((videoWidth * blurMask.widthPercent) / 100));
  const h = Math.max(
    2,
    Math.round((videoHeight * blurMask.heightPercent) / 100),
  );

  return {
    x: Math.min(x, Math.max(0, videoWidth - 2)),
    y: Math.min(y, Math.max(0, videoHeight - 2)),
    w: Math.min(w, videoWidth - x),
    h: Math.min(h, videoHeight - y),
  };
}

/**
 * 生成自定义文字叠加 ASS 临时文件（全程显示，如频道名）
 */
async function createWatermarkAssFile(
  overlay: CustomTextOverlay,
  videoWidth: number,
  videoHeight: number,
  durationSec: number,
): Promise<string> {
  const w = Math.max(1, videoWidth);
  const h = Math.max(1, videoHeight);
  const minX = (overlay.marginL / w) * 100;
  const maxX = ((w - overlay.marginR) / w) * 100;
  const minY = (overlay.marginV / h) * 100;
  const maxY = ((h - overlay.marginV) / h) * 100;
  const x = Math.round(
    (Math.max(minX, Math.min(maxX, overlay.posXPercent)) / 100) * w,
  );
  const y = Math.round(
    (Math.max(minY, Math.min(maxY, overlay.posYPercent)) / 100) * h,
  );
  const assAlign = convertAlignment(overlay.alignment);
  const primary = cssColorToAss(overlay.primaryColor, 0);
  const outlineCol = cssColorToAss(overlay.outlineColor, 0);
  const backCol = cssColorToAss(overlay.backColor, 128);
  const endMs = Math.max(1000, Math.round((durationSec || 3600) * 1000));
  const safeText = overlay.text
    .replace(/\r/g, '')
    .replace(/\n/g, '\\N')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}');
  const inlineTags = [
    `{\\pos(${x},${y})}`,
    overlay.scaleX !== 100 ? `{\\fscx${overlay.scaleX}}` : '',
    overlay.scaleY !== 100 ? `{\\fscy${overlay.scaleY}}` : '',
    overlay.letterSpacing ? `{\\fsp${overlay.letterSpacing}}` : '',
    overlay.angle ? `{\\frz${overlay.angle}}` : '',
  ]
    .filter(Boolean)
    .join('');

  const content = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Watermark,${overlay.fontName},${overlay.fontSize},${primary},${primary},${outlineCol},${backCol},${overlay.bold ? -1 : 0},${overlay.italic ? -1 : 0},${overlay.underline ? -1 : 0},${overlay.strikeOut ? -1 : 0},100,100,0,0,${overlay.borderStyle},${overlay.outline},${overlay.shadow ?? 0},${assAlign},${overlay.marginL},${overlay.marginR},${overlay.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,${formatAssTime(endMs)},Watermark,,0,0,0,,${inlineTags}${safeText}
`;

  const tmpDir = path.join(os.tmpdir(), 'video-subtitle-master');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const tmpPath = path.join(tmpDir, `watermark_${Date.now()}.ass`);
  await fs.promises.writeFile(tmpPath, content, 'utf-8');
  logMessage(`创建自定义文字叠加 ASS: ${tmpPath}`, 'info');
  return tmpPath;
}

/**
 * 预处理字幕：整词换行并写入临时文件
 */
async function prepareSubtitleForMerge(
  subtitlePath: string,
  style: SubtitleStyle,
  videoWidth: number,
): Promise<{ path: string; tempPaths: string[] }> {
  const tempPaths: string[] = [];
  const format: SubtitleFormat = detectSubtitleFormat(subtitlePath);
  const content = await fs.promises.readFile(subtitlePath, 'utf-8');
  const entries = parseSubtitleEntries(content, format);

  const wrappedEntries = entries.map((entry) => {
    const originalText = (entry.content || []).join('\n');
    const wrappedText = wrapSubtitleTextForVideo(
      originalText,
      style,
      videoWidth,
    );
    return {
      id: entry.id,
      startEndTime: entry.startEndTime,
      text: wrappedText,
    };
  });

  const serialized = serializeSubtitleEntries(wrappedEntries, format);
  const tmpDir = path.join(os.tmpdir(), 'video-subtitle-master');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const ext = path.extname(subtitlePath) || '.srt';
  const tmpPath = path.join(tmpDir, `wrapped_${Date.now()}${ext}`);
  await fs.promises.writeFile(tmpPath, serialized, 'utf-8');
  tempPaths.push(tmpPath);
  logMessage(`创建换行预处理字幕文件: ${tmpPath}`, 'info');

  return { path: tmpPath, tempPaths };
}

function buildPostProcessChain(
  scaleVideo: boolean,
  targetWidth: number,
  targetHeight: number,
  changeFps: boolean,
  targetFps: number,
): string {
  const parts: string[] = [];
  if (scaleVideo && targetWidth > 0 && targetHeight > 0) {
    parts.push(`scale=${targetWidth}:${targetHeight}`);
  }
  if (changeFps && targetFps > 0) {
    parts.push(`fps=${targetFps}`);
  }
  return parts.join(',');
}

function parseFrameRate(value?: string | number): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const trimmed = String(value).trim();
  if (!trimmed) return 0;
  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/').map(Number);
    if (!den) return 0;
    return num / den;
  }
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveExportTarget(
  exportSettings: VideoExportSettings | undefined,
  sourceWidth: number,
  sourceHeight: number,
  sourceFps: number,
): {
  targetWidth: number;
  targetHeight: number;
  scaleVideo: boolean;
  targetFps: number;
  changeFps: boolean;
} {
  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;

  if (exportSettings?.resolutionPreset === 'custom') {
    targetWidth = exportSettings.customWidth || sourceWidth;
    targetHeight = exportSettings.customHeight || sourceHeight;
  } else if (
    exportSettings?.resolutionPreset &&
    exportSettings.resolutionPreset !== 'source'
  ) {
    const [widthText, heightText] = exportSettings.resolutionPreset.split('x');
    const presetWidth = parseInt(widthText, 10);
    const presetHeight = parseInt(heightText, 10);
    if (presetWidth > 0 && presetHeight > 0) {
      targetWidth = presetWidth;
      targetHeight = presetHeight;
    }
  }

  const scaleVideo =
    sourceWidth > 0 &&
    sourceHeight > 0 &&
    (targetWidth !== sourceWidth || targetHeight !== sourceHeight);

  let targetFps = sourceFps > 0 ? sourceFps : 30;
  let changeFps = false;
  if (exportSettings?.fpsMode === 'custom') {
    targetFps = Math.min(60, Math.max(1, exportSettings.customFps || 30));
    changeFps = sourceFps <= 0 || Math.abs(targetFps - sourceFps) > 0.01;
  }

  return {
    targetWidth,
    targetHeight,
    scaleVideo,
    targetFps,
    changeFps,
  };
}

function buildVideoFilterGraph(
  subtitlePath: string,
  forceStyle: string,
  blurMask: SubtitleBlurMask | undefined,
  watermarkPath: string | undefined,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  scaleVideo: boolean,
  changeFps: boolean,
  targetFps: number,
): { filterGraph: string; outputLabel: string; useComplexFilter: boolean } {
  const escapedSubPath = escapeSubtitlePath(subtitlePath);
  const subtitleRenderWidth = targetWidth > 0 ? targetWidth : sourceWidth;
  const subtitleRenderHeight = targetHeight > 0 ? targetHeight : sourceHeight;
  const originalSize =
    subtitleRenderWidth > 0 && subtitleRenderHeight > 0
      ? `:original_size=${subtitleRenderWidth}x${subtitleRenderHeight}`
      : '';
  const subtitlesFilter = `subtitles='${escapedSubPath}'${originalSize}:force_style='${forceStyle}'`;
  const watermarkFilter = watermarkPath
    ? `,subtitles='${escapeSubtitlePath(watermarkPath)}'${originalSize}`
    : '';
  const postChain = buildPostProcessChain(
    scaleVideo,
    targetWidth,
    targetHeight,
    changeFps,
    targetFps,
  );

  const blurEnabled = blurMask?.enabled && sourceWidth > 0 && sourceHeight > 0;

  if (blurEnabled) {
    const { x, y, w, h } = getBlurRegionPixels(
      blurMask!,
      sourceWidth,
      sourceHeight,
    );
    const strength = Math.max(1, blurMask!.strength);
    const graph = [
      '[0:v]split[sm_main][sm_tmp]',
      `[sm_tmp]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${strength}:luma_power=2[sm_blur]`,
      `[sm_main][sm_blur]overlay=${x}:${y}[sm_base]`,
      `[sm_base]${subtitlesFilter}${watermarkFilter}[sm_out]`,
    ];

    let outputLabel = '[sm_out]';
    if (postChain) {
      graph.push(`[sm_out]${postChain}[sm_final]`);
      outputLabel = '[sm_final]';
    }

    return {
      filterGraph: graph.join(';'),
      outputLabel,
      useComplexFilter: true,
    };
  }

  if (postChain) {
    return {
      filterGraph: `${subtitlesFilter}${watermarkFilter},${postChain}`,
      outputLabel: '',
      useComplexFilter: false,
    };
  }

  return {
    filterGraph: `${subtitlesFilter}${watermarkFilter}`,
    outputLabel: '',
    useComplexFilter: false,
  };
}

function cleanupTempSubtitles(tempPaths: string[]): void {
  for (const tmpPath of tempPaths) {
    cleanupTempSubtitle(tmpPath);
  }
}

/**
 * 获取视频信息
 */
export function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logMessage(`获取视频信息失败: ${err.message}`, 'error');
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video',
      );
      const stats = fs.statSync(videoPath);
      const fps = parseFrameRate(
        videoStream?.avg_frame_rate || videoStream?.r_frame_rate,
      );

      resolve({
        path: videoPath,
        fileName: path.basename(videoPath),
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        size: stats.size,
        fps: Math.round(fps * 100) / 100,
      });
    });
  });
}

/**
 * 合并字幕到视频
 */
export async function mergeSubtitleToVideo(
  config: MergeConfig,
  onProgress?: (progress: MergeProgress) => void,
): Promise<string> {
  const {
    videoPath,
    subtitlePath,
    outputPath,
    style,
    blurMask,
    customTextOverlay,
    exportSettings,
  } = config;

  let totalDurationSec = 0;
  let videoWidth = 0;
  let videoHeight = 0;
  let sourceFps = 0;

  try {
    const videoInfo = await getVideoInfo(videoPath);
    videoWidth = videoInfo.width;
    videoHeight = videoInfo.height;
    sourceFps = videoInfo.fps;
    totalDurationSec = videoInfo.duration || 0;
  } catch (err) {
    logMessage(
      `获取视频分辨率失败，跳过 original_size 设置: ${err}`,
      'warning',
    );
  }

  const exportTarget = resolveExportTarget(
    exportSettings,
    videoWidth,
    videoHeight,
    sourceFps,
  );
  const wrapWidth =
    exportTarget.targetWidth > 0
      ? exportTarget.targetWidth
      : videoWidth || 1920;
  const wrapHeight =
    exportTarget.targetHeight > 0
      ? exportTarget.targetHeight
      : videoHeight || 1080;

  const tempPaths: string[] = [];
  let actualSubPath = subtitlePath;
  let watermarkPath: string | undefined;

  if (
    customTextOverlay?.enabled &&
    customTextOverlay.text.trim() &&
    wrapWidth > 0 &&
    wrapHeight > 0
  ) {
    try {
      watermarkPath = await createWatermarkAssFile(
        customTextOverlay,
        wrapWidth,
        wrapHeight,
        totalDurationSec,
      );
      tempPaths.push(watermarkPath);
    } catch (err) {
      logMessage(`创建自定义文字叠加失败: ${err}`, 'warning');
    }
  }

  try {
    const prepared = await prepareSubtitleForMerge(
      subtitlePath,
      style,
      wrapWidth,
    );
    actualSubPath = prepared.path;
    tempPaths.push(...prepared.tempPaths);
  } catch (err) {
    logMessage(`字幕换行预处理失败，使用原文件: ${err}`, 'warning');
    if (pathNeedsSafeCopy(subtitlePath)) {
      const tmpSubPath = createSafeSubtitleCopy(subtitlePath);
      actualSubPath = tmpSubPath;
      tempPaths.push(tmpSubPath);
    }
  }

  return new Promise((resolve, reject) => {
    const forceStyle = buildForceStyle(style);
    const { filterGraph, outputLabel, useComplexFilter } =
      buildVideoFilterGraph(
        actualSubPath,
        forceStyle,
        blurMask,
        watermarkPath,
        videoWidth,
        videoHeight,
        exportTarget.targetWidth,
        exportTarget.targetHeight,
        exportTarget.scaleVideo,
        exportTarget.changeFps,
        exportTarget.targetFps,
      );

    logMessage(`开始合并字幕: ${videoPath}`, 'info');
    logMessage(`字幕文件: ${subtitlePath}`, 'info');
    logMessage(`实际字幕文件: ${actualSubPath}`, 'info');
    logMessage(`输出文件: ${outputPath}`, 'info');
    logMessage(
      `导出设置: ${exportTarget.targetWidth}x${exportTarget.targetHeight} @ ${exportTarget.targetFps}fps`,
      'info',
    );
    logMessage(`video filter: ${filterGraph}`, 'info');

    onProgress?.({
      percent: 0,
      timeMark: '00:00:00',
      targetSize: 0,
      status: 'processing',
    });

    const command = ffmpeg(videoPath);

    if (useComplexFilter) {
      command.complexFilter(filterGraph);
      command.outputOptions([
        '-map',
        outputLabel,
        '-map',
        '0:a?',
        '-c:a',
        'copy',
        '-y',
      ]);
    } else {
      command.videoFilters(filterGraph);
      command.outputOptions(['-c:a', 'copy', '-y']);
    }

    command
      .on('start', (cmd) => {
        logMessage(`FFmpeg 命令: ${cmd}`, 'info');
      })
      .on('progress', (progress) => {
        let percent = progress.percent;
        if (
          (percent === undefined ||
            percent === null ||
            Number.isNaN(percent) ||
            percent <= 0) &&
          totalDurationSec > 0 &&
          progress.timemark
        ) {
          percent =
            (timemarkToSeconds(progress.timemark) / totalDurationSec) * 100;
        }
        percent = Math.max(percent || 0, 0);
        logMessage(`合并进度: ${percent.toFixed(1)}%`, 'info');
        onProgress?.({
          percent: Math.min(percent, 99),
          timeMark: progress.timemark || '00:00:00',
          targetSize: progress.targetSize || 0,
          status: 'processing',
        });
      })
      .on('end', () => {
        cleanupTempSubtitles(tempPaths);
        logMessage('字幕合并完成', 'info');
        onProgress?.({
          percent: 100,
          timeMark: '',
          targetSize: 0,
          status: 'completed',
        });
        resolve(outputPath);
      })
      .on('error', (err) => {
        cleanupTempSubtitles(tempPaths);
        logMessage(`字幕合并失败: ${err.message}`, 'error');
        onProgress?.({
          percent: 0,
          timeMark: '',
          targetSize: 0,
          status: 'error',
          errorMessage: err.message,
        });
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * 生成默认输出路径
 */
export function generateOutputPath(
  videoPath: string,
  suffix: string = '_subtitled',
): string {
  const dir = path.dirname(videoPath);
  const ext = path.extname(videoPath);
  const baseName = path.basename(videoPath, ext);
  return path.join(dir, `${baseName}${suffix}${ext}`);
}

/**
 * 检查字幕文件格式
 */
export function getSubtitleFormat(subtitlePath: string): string {
  const ext = path.extname(subtitlePath).toLowerCase();
  const formatMap: Record<string, string> = {
    '.srt': 'srt',
    '.ass': 'ass',
    '.ssa': 'ssa',
    '.vtt': 'vtt',
  };
  return formatMap[ext] || 'unknown';
}

/**
 * 统计字幕条数
 */
export async function countSubtitles(subtitlePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(subtitlePath, 'utf-8');
    const format = getSubtitleFormat(subtitlePath);

    if (format === 'srt') {
      // SRT 格式: 通过数字序号计数
      const matches = content.match(/^\d+\s*$/gm);
      return matches ? matches.length : 0;
    } else if (format === 'ass' || format === 'ssa') {
      // ASS/SSA 格式: 通过 Dialogue 行计数
      const matches = content.match(/^Dialogue:/gm);
      return matches ? matches.length : 0;
    } else if (format === 'vtt') {
      // VTT 格式: 通过时间戳行计数
      const matches = content.match(/^\d{2}:\d{2}/gm);
      return matches ? matches.length : 0;
    }

    return 0;
  } catch (error) {
    logMessage(`统计字幕条数失败: ${error}`, 'error');
    return 0;
  }
}
