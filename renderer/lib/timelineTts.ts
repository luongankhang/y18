import type { TimelineClip } from '../../types/subtitleMerge';

export interface TimedTtsCue {
  id?: string;
  text: string;
  start: number;
  end: number;
}

export interface TimedTtsOutput {
  itemId?: string;
  outputPath: string;
  duration: number;
}

export interface TimedTtsClipInput {
  sourceFile: string;
  duration: number;
  startTime: number;
  metadata: TimelineClip['metadata'];
}

/**
 * Keep generated voice anchored to the original SRT cue instead of appending
 * files to the end of the audio track. The clip is capped at the cue window
 * so one long generation cannot bleed into the next subtitle.
 */
export function buildTimedTtsClipInputs(
  cues: TimedTtsCue[],
  outputs: TimedTtsOutput[],
  metadata: TimelineClip['metadata'],
): TimedTtsClipInput[] {
  const outputsById = new Map(
    outputs.map((output, index) => [output.itemId || `cue-${index}`, output]),
  );
  return cues.flatMap((cue, index) => {
    const start = Math.max(0, Number(cue.start));
    const end = Math.max(start, Number(cue.end));
    const output = outputsById.get(cue.id || `cue-${index}`) || outputs[index];
    if (
      !output?.outputPath ||
      !Number.isFinite(output.duration) ||
      end <= start
    )
      return [];
    return [
      {
        sourceFile: output.outputPath,
        duration: Math.max(0.05, Math.min(output.duration, end - start)),
        startTime: start,
        metadata: {
          ...metadata,
          text: cue.text,
          subtitleCueId: cue.id || `cue-${index}`,
          subtitleStartTime: start,
          subtitleEndTime: end,
        } as TimelineClip['metadata'],
      },
    ];
  });
}
