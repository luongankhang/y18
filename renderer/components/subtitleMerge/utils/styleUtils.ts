/**
 * 字幕样式工具函数
 * 用于前端 CSS 预览模拟
 */

import type {
  SubtitleStyle,
  SubtitleAlignment,
  SubtitleBlurMask,
  CustomTextOverlay,
} from '../../../../types/subtitleMerge';

/**
 * 将字幕样式转换为 CSS 样式对象
 * 用于前端实时预览
 */
export function subtitleStyleToCSS(
  style: SubtitleStyle,
  scaleFactor: number = 1,
): React.CSSProperties {
  const scaleX = (style.scaleX ?? 100) / 100;
  const scaleY = (style.scaleY ?? 100) / 100;
  const decorations: string[] = [];
  if (style.underline) decorations.push('underline');
  if (style.strikeOut) decorations.push('line-through');

  const css: React.CSSProperties = {
    fontFamily: style.fontName,
    fontSize: `${Math.max(8, style.fontSize * scaleFactor)}px`,
    color: applyAssAlphaToCss(style.primaryColor, style.primaryAlpha ?? 0),
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: decorations.length > 0 ? decorations.join(' ') : 'none',
    textAlign: getTextAlign(style.alignment),
    padding: '4px 8px',
    lineHeight: style.lineHeight ?? 1.4,
    letterSpacing: `${style.letterSpacing ?? 0}px`,
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    maxWidth: '100%',
    display: 'inline-block',
    transform: `scale(${scaleX}, ${scaleY}) rotate(${style.angle ?? 0}deg)`,
    transformOrigin: 'center center',
  };

  // 根据边框样式处理
  if (style.borderStyle === 3) {
    const alpha = assAlphaToCssOpacity(style.backAlpha ?? 128);
    css.backgroundColor = hexToRgba(style.backColor, alpha);
    css.borderRadius = '4px';
  } else {
    // 边框 + 阴影模式
    const shadows: string[] = [];

    // 文字描边效果
    if (style.outline > 0) {
      const outlineSize = Math.min(style.outline, 4);
      for (let x = -outlineSize; x <= outlineSize; x++) {
        for (let y = -outlineSize; y <= outlineSize; y++) {
          if (x !== 0 || y !== 0) {
            shadows.push(`${x}px ${y}px 0 ${style.outlineColor}`);
          }
        }
      }
    }

    // 阴影效果
    if (style.shadow > 0) {
      shadows.push(
        `${style.shadow}px ${style.shadow}px ${style.shadow}px ${style.backColor}`,
      );
    }

    if (shadows.length > 0) {
      css.textShadow = shadows.join(', ');
    }
  }

  return css;
}

/**
 * 获取字幕容器的定位样式（锚点 + 边距，与 ASS / 自定义文字一致）
 */
export function getSubtitleContainerStyle(
  style: SubtitleStyle,
  videoWidth = 1920,
  videoHeight = 1080,
): React.CSSProperties {
  const { posXPercent, posYPercent } = getOverlayPositionForAlignment(
    style.alignment,
    style.marginL,
    style.marginR,
    style.marginV,
    videoWidth,
    videoHeight,
  );

  return {
    position: 'absolute',
    left: `${posXPercent}%`,
    top: `${posYPercent}%`,
    transform: getCustomPositionTransform(style.alignment),
    maxWidth: `calc(100% - ${style.marginL + style.marginR}px)`,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };
}

/** ASS 九宫格行：0=下(1-3), 1=中(4-6), 2=上(7-9) */
function getAlignmentRow(alignment: SubtitleAlignment): number {
  return Math.floor((alignment - 1) / 3);
}

/** 自定义 pos 模式下，锚点随 alignment 变化（与 ASS 锚点一致） */
export function getCustomPositionTransform(
  alignment: SubtitleAlignment,
): string {
  const col = (alignment - 1) % 3;
  const row = getAlignmentRow(alignment);
  const tx = col === 0 ? '0%' : col === 1 ? '-50%' : '-100%';
  // row 0 下(1-3) 锚点在底部，row 1 中，row 2 上(7-9) 锚点在顶部
  const ty = row === 0 ? '-100%' : row === 1 ? '-50%' : '0%';
  return `translate(${tx}, ${ty})`;
}

/** 将 pos 百分比限制在安全边距内 */
export function clampOverlayPositionPercent(
  posXPercent: number,
  posYPercent: number,
  marginL: number,
  marginR: number,
  marginV: number,
  videoWidth: number,
  videoHeight: number,
): { posXPercent: number; posYPercent: number } {
  const w = Math.max(1, videoWidth);
  const h = Math.max(1, videoHeight);
  const minX = (marginL / w) * 100;
  const maxX = ((w - marginR) / w) * 100;
  const minY = (marginV / h) * 100;
  const maxY = ((h - marginV) / h) * 100;
  return {
    posXPercent: Math.max(minX, Math.min(maxX, posXPercent)),
    posYPercent: Math.max(minY, Math.min(maxY, posYPercent)),
  };
}

/** 九宫格对齐 → 带边距的预设位置（百分比） */
export function getOverlayPositionForAlignment(
  alignment: SubtitleAlignment,
  marginL: number,
  marginR: number,
  marginV: number,
  videoWidth = 1920,
  videoHeight = 1080,
): { posXPercent: number; posYPercent: number } {
  const w = Math.max(1, videoWidth);
  const h = Math.max(1, videoHeight);
  const col = (alignment - 1) % 3;
  const row = getAlignmentRow(alignment);

  let xPx: number;
  if (col === 0) xPx = marginL;
  else if (col === 1) xPx = w / 2;
  else xPx = w - marginR;

  let yPx: number;
  if (row === 0) yPx = h - marginV;
  else if (row === 1) yPx = h / 2;
  else yPx = marginV;

  return {
    posXPercent: Math.round((xPx / w) * 1000) / 10,
    posYPercent: Math.round((yPx / h) * 1000) / 10,
  };
}

export function getCustomPositionContainerStyle(
  overlay: CustomTextOverlay,
  draggable = false,
  videoWidth = 1920,
  videoHeight = 1080,
): React.CSSProperties {
  const { posXPercent, posYPercent } = clampOverlayPositionPercent(
    overlay.posXPercent,
    overlay.posYPercent,
    overlay.marginL,
    overlay.marginR,
    overlay.marginV,
    videoWidth,
    videoHeight,
  );

  return {
    position: 'absolute',
    left: `${posXPercent}%`,
    top: `${posYPercent}%`,
    transform: getCustomPositionTransform(overlay.alignment),
    maxWidth: `calc(100% - ${overlay.marginL + overlay.marginR}px)`,
    boxSizing: 'border-box',
    pointerEvents: draggable ? 'auto' : 'none',
    cursor: draggable ? 'move' : 'default',
    touchAction: 'none',
    zIndex: draggable ? 20 : 15,
    whiteSpace: 'nowrap',
  };
}

/** 自定义文字叠加预览样式 */
export function customTextOverlayToCSS(
  overlay: CustomTextOverlay,
  scaleFactor: number = 1,
): React.CSSProperties {
  const outlinePx = Math.max(0, overlay.outline * scaleFactor);
  const shadowPx = Math.max(0, (overlay.shadow ?? 0) * scaleFactor);
  const scaleX = (overlay.scaleX ?? 100) / 100;
  const scaleY = (overlay.scaleY ?? 100) / 100;
  const decorations: string[] = [];
  if (overlay.underline) decorations.push('underline');
  if (overlay.strikeOut) decorations.push('line-through');

  const css: React.CSSProperties = {
    fontFamily: overlay.fontName,
    fontSize: `${Math.max(8, overlay.fontSize * scaleFactor)}px`,
    color: overlay.primaryColor,
    fontWeight: overlay.bold ? 'bold' : 'normal',
    fontStyle: overlay.italic ? 'italic' : 'normal',
    textDecoration: decorations.length ? decorations.join(' ') : 'none',
    letterSpacing:
      overlay.letterSpacing !== 0
        ? `${overlay.letterSpacing * scaleFactor}px`
        : undefined,
    display: 'inline-block',
    transform:
      scaleX !== 1 || scaleY !== 1 || overlay.angle
        ? `scale(${scaleX}, ${scaleY}) rotate(${overlay.angle ?? 0}deg)`
        : undefined,
    transformOrigin: 'center center',
  };

  if (overlay.borderStyle === 3) {
    css.backgroundColor = overlay.backColor;
    css.padding = `${4 * scaleFactor}px ${8 * scaleFactor}px`;
    css.borderRadius = `${2 * scaleFactor}px`;
  }

  const shadows: string[] = [];
  if (outlinePx > 0) {
    shadows.push(
      `${outlinePx}px 0 0 ${overlay.outlineColor}`,
      `-${outlinePx}px 0 0 ${overlay.outlineColor}`,
      `0 ${outlinePx}px 0 ${overlay.outlineColor}`,
      `0 -${outlinePx}px 0 ${overlay.outlineColor}`,
    );
  }
  if (shadowPx > 0) {
    shadows.push(
      `${shadowPx}px ${shadowPx}px ${shadowPx * 2}px rgba(0,0,0,0.85)`,
    );
  }
  if (shadows.length) {
    css.textShadow = shadows.join(', ');
  }

  return css;
}

/**
 * 根据对齐方式获取文本对齐
 */
function getTextAlign(
  alignment: SubtitleAlignment,
): 'left' | 'center' | 'right' {
  // 1,4,7 = 左
  // 2,5,8 = 中
  // 3,6,9 = 右
  const col = (alignment - 1) % 3;
  if (col === 0) return 'left';
  if (col === 1) return 'center';
  return 'right';
}

/**
 * 十六进制颜色转 rgba
 */
function hexToRgba(hex: string, alpha: number = 1): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** ASS alpha (0=opaque, 255=transparent) -> CSS opacity */
function assAlphaToCssOpacity(assAlpha: number): number {
  return Math.max(0, Math.min(1, 1 - assAlpha / 255));
}

function applyAssAlphaToCss(color: string, assAlpha: number): string {
  if (!assAlpha) return color;
  const opacity = assAlphaToCssOpacity(assAlpha);
  if (color.startsWith('#')) {
    return hexToRgba(color, opacity);
  }
  return color;
}

/**
 * 模糊遮罩预览样式
 */
export function getBlurMaskPreviewStyle(
  blurMask: SubtitleBlurMask,
): React.CSSProperties {
  if (!blurMask.enabled) {
    return { display: 'none' };
  }

  return {
    position: 'absolute',
    left: `${blurMask.xPercent}%`,
    top: `${blurMask.yPercent}%`,
    width: `${blurMask.widthPercent}%`,
    height: `${blurMask.heightPercent}%`,
    backdropFilter: `blur(${blurMask.strength}px)`,
    WebkitBackdropFilter: `blur(${blurMask.strength}px)`,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    pointerEvents: 'none',
    borderRadius: '2px',
  };
}

/**
 * 根据视频分辨率与预览容器高度计算字号缩放比
 */
export function getPreviewScaleFactor(
  videoHeight: number | null | undefined,
  containerHeight: number,
): number {
  if (!videoHeight || videoHeight <= 0 || containerHeight <= 0) {
    return 1;
  }
  return containerHeight / videoHeight;
}

/**
 * 格式化时长
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
