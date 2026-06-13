/**
 * 预览 + 时间轴编辑区（展示组件，与播放状态更新隔离 memo）
 */

import React, { memo } from 'react';
import { useTranslation } from 'next-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ReactPlayer from 'react-player';
import type {
  MergeCue,
  SubtitleBlurMask,
  SubtitleStyle,
  VideoInfo,
  CustomTextOverlay,
} from '../../../types/subtitleMerge';
import VideoPreview from './VideoPreview';
import SubtitleCueList from './SubtitleCueList';

export interface MergePreviewSectionProps {
  videoPath: string | null;
  subtitlePath: string | null;
  videoInfo: VideoInfo | null;
  style: SubtitleStyle;
  blurMask: SubtitleBlurMask;
  customTextOverlay: CustomTextOverlay;
  disabled?: boolean;
  previewText: string;
  playerRef: React.RefObject<ReactPlayer>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  cues: MergeCue[];
  selectedIndex: number;
  activeIndex: number;
  isDirty: boolean;
  onProgress: (state: { playedSeconds: number }) => void;
  onDuration: (duration: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSelectCue: (index: number) => void;
  onUpdateCueText: (index: number, text: string) => void;
  onUpdateCueTime: (
    index: number,
    field: 'start' | 'end',
    value: string,
  ) => void;
  onAddCue: () => void;
  onDeleteCue: () => void;
  onSaveCues: () => void;
  onOverlayPositionChange?: (posXPercent: number, posYPercent: number) => void;
}

function MergePreviewSection({
  videoPath,
  subtitlePath,
  videoInfo,
  style,
  blurMask,
  customTextOverlay,
  disabled = false,
  previewText,
  playerRef,
  currentTime,
  duration,
  isPlaying,
  cues,
  selectedIndex,
  activeIndex,
  isDirty,
  onProgress,
  onDuration,
  onSeek,
  onTogglePlay,
  onSelectCue,
  onUpdateCueText,
  onUpdateCueTime,
  onAddCue,
  onDeleteCue,
  onSaveCues,
  onOverlayPositionChange,
}: MergePreviewSectionProps) {
  const { t } = useTranslation('subtitleMerge');

  return (
    <Card className="flex flex-col min-h-0 overflow-hidden flex-1">
      <CardHeader className="flex-shrink-0 py-3 px-4">
        <CardTitle className="text-sm">{t('preview')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0 px-4 pb-4 overflow-auto space-y-3">
        <VideoPreview
          videoPath={videoPath}
          videoInfo={videoInfo}
          style={style}
          blurMask={blurMask}
          previewText={previewText}
          customTextOverlay={customTextOverlay}
          playerRef={playerRef}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onOverlayPositionChange={onOverlayPositionChange}
          onProgress={onProgress}
          onDuration={onDuration}
          onSeek={onSeek}
          onTogglePlay={onTogglePlay}
        />

        {subtitlePath && videoPath && (
          <div>
            <h3 className="text-xs font-medium mb-2 text-muted-foreground">
              {t('cueEditor')}
            </h3>
            <SubtitleCueList
              cues={cues}
              selectedIndex={selectedIndex}
              activeIndex={activeIndex}
              isDirty={isDirty}
              isPlaying={isPlaying}
              disabled={disabled}
              onSelectCue={onSelectCue}
              onUpdateCueText={onUpdateCueText}
              onUpdateCueTime={onUpdateCueTime}
              onAddCue={onAddCue}
              onDeleteCue={onDeleteCue}
              onSave={onSaveCues}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(MergePreviewSection);
