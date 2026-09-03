/**

 * 字幕合并主面板组件

 * 整合所有子组件，提供完整的字幕合并功能界面

 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from 'next-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { ScrollArea } from '@/components/ui/scroll-area';

import { Separator } from '@/components/ui/separator';

import FileSelector from './FileSelector';

import StylePresets from './StylePresets';

import BasicStyleSettings from './BasicStyleSettings';

import AdvancedStyleSettings from './AdvancedStyleSettings';

import TypographyStyleSettings from './TypographyStyleSettings';

import BlurMaskSettings from './BlurMaskSettings';

import CustomTextOverlaySettings from './CustomTextOverlaySettings';

import MergePreviewSection from './MergePreviewSection';

import MergeButton from './MergeButton';

import {
  useSubtitleMerge,
  type UseSubtitleMergeOptions,
} from './hooks/useSubtitleMerge';

import { useMergePreviewSession } from './hooks/useMergePreviewSession';

import { parseShortTime } from './utils/timeUtils';
import TimelineEditor from './TimelineEditor';
import type { TimelineProject } from '../../../types/subtitleMerge';

interface SubtitleMergePanelProps extends UseSubtitleMergeOptions {
  title?: string;

  showTitle?: boolean;

  className?: string;
}

export default function SubtitleMergePanel({
  title,

  showTitle = true,

  className = '',

  ...hookOptions
}: SubtitleMergePanelProps) {
  const { t } = useTranslation('subtitleMerge');

  const {
    videoPath,

    subtitlePath,

    videoInfo,

    subtitleInfo,

    style,

    blurMask,

    activePresetId,

    outputPath,

    progress,

    status,

    selectVideo,

    selectSubtitle,

    clearFiles,

    updateStyle,

    updateBlurMask,

    customTextOverlay,

    updateCustomTextOverlay,

    applyPreset,

    selectOutputPath,

    startMerge,

    canMerge,

    openOutputFolder,

    exportSettings,

    updateExportSettings,
  } = useSubtitleMerge(hookOptions);

  const preview = useMergePreviewSession(subtitlePath, style, videoInfo?.width);
  const [timelineProject, setTimelineProject] =
    useState<TimelineProject | null>(null);
  const [timelineExporting, setTimelineExporting] = useState(false);
  const [timelineExportPercent, setTimelineExportPercent] = useState(0);

  useEffect(() => {
    const cleanup = window.ipc?.on(
      'subtitleMerge:timelineProgress',
      (data: { percent: number }) =>
        setTimelineExportPercent(data.percent || 0),
    );
    return cleanup;
  }, []);

  const previewRef = useRef(preview);
  previewRef.current = preview;

  const handleOverlayPositionChange = useCallback(
    (posXPercent: number, posYPercent: number) => {
      updateCustomTextOverlay({ posXPercent, posYPercent });
    },
    [updateCustomTextOverlay],
  );

  const handleUpdateCueTime = useCallback(
    (index: number, field: 'start' | 'end', value: string) => {
      const seconds = parseShortTime(value);
      if (seconds === null) return;
      const cue = previewRef.current.cues[index];
      if (!cue) return;
      if (field === 'start') {
        previewRef.current.updateCue(index, {
          startTimeInSeconds: seconds,
          endTimeInSeconds: cue.endTimeInSeconds,
        });
      } else {
        previewRef.current.updateCue(index, {
          startTimeInSeconds: cue.startTimeInSeconds,
          endTimeInSeconds: seconds,
        });
      }
    },
    [],
  );

  const canTimelineExport = Boolean(
    timelineProject &&
      outputPath &&
      timelineProject.tracks.some(
        (track) => track.type === 'video' && track.clips.length > 0,
      ),
  );

  const handleStartMerge = useCallback(async () => {
    const timelineHasEdits = timelineProject?.tracks.some(
      (track) =>
        track.clips.length >
          (track.type === 'subtitle' && subtitlePath ? 1 : 0) ||
        track.clips.some(
          (clip) =>
            clip.startTime > 0 || clip.trimStart > 0 || clip.trimEnd > 0,
        ),
    );
    if (
      timelineProject &&
      canTimelineExport &&
      (!subtitlePath || timelineHasEdits) &&
      outputPath
    ) {
      setTimelineExporting(true);
      setTimelineExportPercent(0);
      try {
        const result = await window.ipc.invoke('subtitleMerge:exportTimeline', {
          project: timelineProject,
          outputPath,
          width: exportSettings.customWidth || videoInfo?.width,
          height: exportSettings.customHeight || videoInfo?.height,
          fps:
            exportSettings.fpsMode === 'custom'
              ? exportSettings.customFps
              : videoInfo?.fps,
          subtitleStyle: style,
          renderMode: exportSettings.renderMode,
        });
        if (!result.success)
          throw new Error(result.error || 'Timeline export failed');
      } catch (error) {
        hookOptions.onError?.(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setTimelineExporting(false);
      }
      return;
    }
    if (previewRef.current.isDirty) {
      const saved = await previewRef.current.saveCues();
      if (!saved) return;
    }
    await startMerge();
  }, [
    startMerge,
    timelineProject,
    outputPath,
    exportSettings,
    videoInfo,
    style,
    subtitlePath,
    canTimelineExport,
  ]);

  const isProcessing = status === 'processing' || timelineExporting;
  const displayedStatus = timelineExporting ? 'processing' : status;
  const displayedProgress = timelineExporting
    ? {
        ...progress,
        percent: timelineExportPercent,
        status: 'processing' as const,
      }
    : progress;
  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="flex-shrink-0 mb-3">
        <FileSelector
          videoPath={videoPath}
          subtitlePath={subtitlePath}
          videoInfo={videoInfo}
          subtitleInfo={subtitleInfo}
          onSelectVideo={selectVideo}
          onSelectSubtitle={selectSubtitle}
          onClearVideo={() => clearFiles()}
          onClearSubtitle={() => clearFiles()}
          disabled={isProcessing}
        />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="flex-shrink-0 py-3 px-4">
            <CardTitle className="text-sm">{t('styleSettings')}</CardTitle>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 pt-0 px-4 pb-4">
            <ScrollArea className="h-full">
              <div className="space-y-3 pr-3">
                <StylePresets
                  activePresetId={activePresetId}
                  onSelectPreset={applyPreset}
                  disabled={isProcessing}
                />

                <Separator />

                <div>
                  <h3 className="text-xs font-medium mb-2 text-muted-foreground">
                    {t('basicSettings')}
                  </h3>

                  <BasicStyleSettings
                    style={style}
                    onUpdateStyle={updateStyle}
                    disabled={isProcessing}
                  />
                </div>

                <Separator />

                <AdvancedStyleSettings
                  style={style}
                  onUpdateStyle={updateStyle}
                  disabled={isProcessing}
                />

                <Separator />

                <TypographyStyleSettings
                  style={style}
                  onUpdateStyle={updateStyle}
                  disabled={isProcessing}
                />

                <Separator />

                <BlurMaskSettings
                  blurMask={blurMask}
                  onUpdateBlurMask={updateBlurMask}
                  disabled={isProcessing}
                />

                <Separator />

                <CustomTextOverlaySettings
                  overlay={customTextOverlay}
                  onUpdateOverlay={updateCustomTextOverlay}
                  videoWidth={videoInfo?.width}
                  videoHeight={videoInfo?.height}
                  disabled={isProcessing}
                />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          <TimelineEditor
            key={videoPath || 'timeline-empty'}
            videoPath={videoPath}
            subtitlePath={subtitlePath}
            duration={videoInfo?.duration || preview.duration}
            disabled={isProcessing}
            onProjectChange={setTimelineProject}
          />

          <details className="group flex-shrink-0 rounded-lg border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40">
              <span>Export video</span>
              <span className="text-[10px] font-normal text-muted-foreground group-open:hidden">
                {outputPath ? 'Ready to configure' : 'Select output path'}
              </span>
              <span className="hidden text-[10px] font-normal text-muted-foreground group-open:inline">
                Click to collapse
              </span>
            </summary>
            <CardContent className="border-t p-4">
              <MergeButton
                outputPath={outputPath}
                progress={displayedProgress}
                status={displayedStatus}
                canMerge={canMerge || canTimelineExport}
                videoInfo={videoInfo}
                exportSettings={exportSettings}
                onUpdateExportSettings={updateExportSettings}
                onSelectOutputPath={selectOutputPath}
                onStartMerge={handleStartMerge}
                onOpenOutputFolder={openOutputFolder}
              />
            </CardContent>
          </details>
        </div>
      </div>
    </div>
  );
}
