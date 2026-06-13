/**
 * 视频预览组件
 */

import React, {
  memo,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { useTranslation } from 'next-i18next';
import ReactPlayer from 'react-player';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause } from 'lucide-react';
import type {
  SubtitleStyle,
  SubtitleBlurMask,
  VideoInfo,
  CustomTextOverlay,
} from '../../../types/subtitleMerge';
import SubtitlePreviewOverlay from './SubtitlePreviewOverlay';
import CustomTextOverlayPreview from './CustomTextOverlayPreview';
import { getPreviewScaleFactor } from './utils/styleUtils';
import { formatTimeShort } from './utils/timeUtils';

interface VideoPreviewProps {
  videoPath: string | null;
  videoInfo: VideoInfo | null;
  style: SubtitleStyle;
  blurMask?: SubtitleBlurMask;
  previewText?: string;
  customTextOverlay?: CustomTextOverlay;
  playerRef?: React.RefObject<ReactPlayer>;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  onProgress?: (state: { playedSeconds: number }) => void;
  onDuration?: (duration: number) => void;
  onSeek?: (time: number) => void;
  onTogglePlay?: () => void;
  onOverlayPositionChange?: (posXPercent: number, posYPercent: number) => void;
}

function VideoPreview({
  videoPath,
  videoInfo,
  style,
  blurMask,
  previewText = '',
  customTextOverlay,
  playerRef: externalPlayerRef,
  currentTime: externalCurrentTime,
  duration: externalDuration,
  isPlaying: externalIsPlaying,
  onProgress,
  onDuration,
  onSeek,
  onTogglePlay,
  onOverlayPositionChange,
}: VideoPreviewProps) {
  const { t } = useTranslation(['subtitleMerge', 'common']);
  const internalPlayerRef = useRef<ReactPlayer>(null);
  const playerRef = externalPlayerRef || internalPlayerRef;
  const containerRef = useRef<HTMLDivElement>(null);

  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [internalDuration, setInternalDuration] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const isPlaying = externalIsPlaying ?? internalIsPlaying;
  const currentTime = externalCurrentTime ?? internalCurrentTime;
  const duration = externalDuration ?? internalDuration;

  const displayText =
    previewText || (!videoPath ? t('common:previewSampleText') : '');

  const scaleFactor = useMemo(
    () => getPreviewScaleFactor(videoInfo?.height, containerHeight),
    [videoInfo?.height, containerHeight],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const nextHeight = entry.contentRect.height;
        setContainerHeight((prev) =>
          Math.abs(prev - nextHeight) > 1 ? nextHeight : prev,
        );
      }
    });

    observer.observe(element);
    setContainerHeight(element.clientHeight);

    return () => observer.disconnect();
  }, [videoPath]);

  const handleProgress = useCallback(
    ({ playedSeconds }: { playedSeconds: number }) => {
      if (onProgress) {
        onProgress({ playedSeconds });
      } else {
        setInternalCurrentTime(playedSeconds);
      }
    },
    [onProgress],
  );

  const handleDuration = useCallback(
    (value: number) => {
      if (onDuration) {
        onDuration(value);
      } else {
        setInternalDuration(value);
      }
    },
    [onDuration],
  );

  const handleSeek = useCallback(
    (value: number[]) => {
      const time = value[0];
      if (onSeek) {
        onSeek(time);
      } else {
        setInternalCurrentTime(time);
        playerRef.current?.seekTo(time, 'seconds');
      }
    },
    [onSeek, playerRef],
  );

  const togglePlay = useCallback(() => {
    if (onTogglePlay) {
      onTogglePlay();
    } else {
      setInternalIsPlaying((prev) => !prev);
    }
  }, [onTogglePlay]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded-lg overflow-hidden"
        style={{ paddingBottom: '56.25%' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {videoPath ? (
            <>
              <ReactPlayer
                ref={playerRef}
                url={`media://${encodeURIComponent(videoPath)}`}
                width="100%"
                height="100%"
                playing={isPlaying}
                controls={false}
                onProgress={handleProgress}
                onDuration={handleDuration}
                progressInterval={250}
                style={{ position: 'absolute', top: 0, left: 0 }}
              />

              <SubtitlePreviewOverlay
                style={style}
                text={displayText}
                blurMask={blurMask}
                scaleFactor={scaleFactor}
                videoWidth={videoInfo?.width}
                videoHeight={videoInfo?.height}
              />

              {customTextOverlay && (
                <CustomTextOverlayPreview
                  overlay={customTextOverlay}
                  scaleFactor={scaleFactor}
                  videoWidth={videoInfo?.width}
                  videoHeight={videoInfo?.height}
                  onPositionChange={onOverlayPositionChange}
                />
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-center">
              <p className="text-sm">{t('selectVideoToPreview')}</p>
            </div>
          )}
        </div>
      </div>

      {videoPath && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <span className="text-xs text-muted-foreground w-10">
            {formatTimeShort(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10 text-right">
            {formatTimeShort(duration)}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(VideoPreview);
