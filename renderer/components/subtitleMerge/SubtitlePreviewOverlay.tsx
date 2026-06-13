/**
 * 字幕预览叠加层
 */

import React, { memo, useMemo } from 'react';
import type {
  SubtitleStyle,
  SubtitleBlurMask,
} from '../../../types/subtitleMerge';
import {
  subtitleStyleToCSS,
  getSubtitleContainerStyle,
  getBlurMaskPreviewStyle,
} from './utils/styleUtils';

interface SubtitlePreviewOverlayProps {
  style: SubtitleStyle;
  text: string;
  blurMask?: SubtitleBlurMask;
  scaleFactor?: number;
  videoWidth?: number;
  videoHeight?: number;
}

function SubtitlePreviewOverlay({
  style,
  text,
  blurMask,
  scaleFactor = 1,
  videoWidth = 1920,
  videoHeight = 1080,
}: SubtitlePreviewOverlayProps) {
  const containerStyle = useMemo(
    () => getSubtitleContainerStyle(style, videoWidth, videoHeight),
    [style, videoWidth, videoHeight],
  );

  const textStyle = useMemo(
    () => subtitleStyleToCSS(style, scaleFactor),
    [style, scaleFactor],
  );

  const blurStyle = useMemo(
    () => (blurMask ? getBlurMaskPreviewStyle(blurMask) : undefined),
    [blurMask],
  );

  if (!text) {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {blurStyle && <div style={blurStyle} />}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {blurStyle && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={blurStyle}
        />
      )}
      <div style={containerStyle}>
        <span style={textStyle}>{text}</span>
      </div>
    </div>
  );
}

export default memo(SubtitlePreviewOverlay);
