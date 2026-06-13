/**
 * 自定义文字叠加预览（频道名、水印等），支持拖拽定位
 */

import React, { memo, useMemo, useRef, useCallback } from 'react';
import type { CustomTextOverlay } from '../../../types/subtitleMerge';
import {
  getCustomPositionContainerStyle,
  customTextOverlayToCSS,
  clampOverlayPositionPercent,
} from './utils/styleUtils';

interface CustomTextOverlayPreviewProps {
  overlay: CustomTextOverlay;
  scaleFactor?: number;
  videoWidth?: number;
  videoHeight?: number;
  onPositionChange?: (posXPercent: number, posYPercent: number) => void;
}

function CustomTextOverlayPreview({
  overlay,
  scaleFactor = 1,
  videoWidth = 1920,
  videoHeight = 1080,
  onPositionChange,
}: CustomTextOverlayPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const containerStyle = useMemo(
    () =>
      getCustomPositionContainerStyle(
        overlay,
        overlay.enabled,
        videoWidth,
        videoHeight,
      ),
    [overlay, videoWidth, videoHeight],
  );

  const textStyle = useMemo(
    () => customTextOverlayToCSS(overlay, scaleFactor),
    [overlay, scaleFactor],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!overlay.enabled || !onPositionChange) return;
      event.preventDefault();
      event.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      event.currentTarget.setPointerCapture(event.pointerId);

      const updateFromEvent = (clientX: number, clientY: number) => {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const rawX = ((clientX - rect.left) / rect.width) * 100;
        const rawY = ((clientY - rect.top) / rect.height) * 100;
        const clamped = clampOverlayPositionPercent(
          rawX,
          rawY,
          overlay.marginL,
          overlay.marginR,
          overlay.marginV,
          videoWidth,
          videoHeight,
        );
        onPositionChange(clamped.posXPercent, clamped.posYPercent);
      };

      updateFromEvent(event.clientX, event.clientY);

      const handleMove = (moveEvent: PointerEvent) => {
        updateFromEvent(moveEvent.clientX, moveEvent.clientY);
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
    },
    [
      overlay.enabled,
      overlay.marginL,
      overlay.marginR,
      overlay.marginV,
      onPositionChange,
      videoWidth,
      videoHeight,
    ],
  );

  if (!overlay.enabled || !overlay.text.trim()) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 pointer-events-none"
      />
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <div
        style={containerStyle}
        onPointerDown={handlePointerDown}
        className="ring-1 ring-amber-400/40 rounded-sm"
      >
        <span style={textStyle}>{overlay.text}</span>
      </div>
    </div>
  );
}

export default memo(CustomTextOverlayPreview);
