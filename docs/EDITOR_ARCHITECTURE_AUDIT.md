# Y18 Editor Architecture Audit

Date: 2026-09-05  
Scope: current repository before the next multi-track editor phase

## 1. Executive Summary

Y18 is a local Electron application built with Nextron, Next.js, React and TypeScript. The repository already contains a functional multi-track timeline prototype, persistent OmniVoice worker, FFmpeg timeline export, subtitle timing helpers, and real integration tests.

The main architectural risk is that the subtitle-merge screen currently contains two editing paths:

1. `TimelineEditor` owns the newer `TimelineProject` state and is used for multi-track preview/export when timeline edits are present.
2. `useSubtitleMerge` plus `VideoPreview`/`MergePreviewSection` owns the legacy single-video subtitle workflow, including style, blur mask and custom text overlay state.

The two paths are composed by `SubtitleMergePanel`. This is intentionally backward-compatible, but it means preview and export are not yet guaranteed to be projections of one complete state for every feature. The next phases should extend the existing `TimelineProject` rather than introduce another editor or another clock.

## 2. Stack and Runtime

| Area           | Current implementation                                                 | Evidence                                                                                            |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Desktop shell  | Electron                                                               | `main/background.ts`, `electron` dependency                                                         |
| App framework  | Nextron + Next.js pages                                                | `package.json`, `renderer/pages/[locale]`                                                           |
| UI             | React + TypeScript + Tailwind/Radix UI                                 | `renderer/components`, `types`                                                                      |
| Main process   | Electron IPC handlers and FFmpeg helpers                               | `main/helpers/ipc*.ts`                                                                              |
| Renderer state | React hooks and immutable project snapshots                            | `useTimelineEditor.ts`, `useSubtitleMerge.ts`                                                       |
| Persistence    | `localStorage` for timeline project; `electron-store` for app settings | `SubtitleMergePanel.tsx`, `main/helpers/store`                                                      |
| Media protocol | Custom `media://` Electron file protocol                               | `main/background.ts`                                                                                |
| Export         | FFmpeg filter graph generated from timeline project                    | `main/helpers/timelineExporter.ts`, `timelineFilterGraph.ts`                                        |
| TTS            | Persistent Python OmniVoice JSONL worker                               | `main/helpers/omnivoiceService.ts`, `scripts/omnivoice_worker.py`                                   |
| Tests          | Node test runner, FFmpeg integration tests, Playwright Electron E2E    | `package.json`, `main/helpers/__tests__`, `renderer/lib/__tests__`, `scripts/omnivoice.e2e.spec.ts` |

## 3. Current Data Flow

```text
Media file
    |
    +--> selectFile / selectFiles IPC
    |        |
    |        +--> videoPath, subtitlePath, asset-like sourceFile strings
    |
    +--> useTimelineEditor
             |
             +--> TimelineProject
                    |
                    +--> tracks[]
                           |
                           +--> TimelineTrack
                                  |
                                  +--> clips[]
                                         |
                                         +--> TimelineClip
                                                |
                                                +--> TimelineEditor preview
                                                |       - video/audio elements
                                                |       - master project clock
                                                |       - subtitle cue projection
                                                |
                                                +--> IPC subtitleMerge:exportTimeline
                                                        |
                                                        +--> timelineExporter
                                                                |
                                                                +--> FFmpeg video graph
                                                                +--> FFmpeg audio graph
                                                                +--> generated SRT burn-in
```

There is also a legacy path:

```text
videoPath + subtitlePath
    |
    +--> useSubtitleMerge
            |
            +--> style
            +--> blurMask
            +--> customTextOverlay
            +--> exportSettings
                    |
                    +--> VideoPreview / MergePreviewSection
                    +--> subtitleMerge:startMerge
                            |
                            +--> subtitleMerger.ts
```

## 4. Project, Track and Clip Schema

### Current project schema

`TimelineProject` currently contains:

```ts
{
  duration: number;
  currentTime: number;
  tracks: TimelineTrack[];
}
```

All timeline time values are seconds. This is correct and should remain the canonical internal unit.

### Current track schema

```ts
{
  id: string;
  type: 'video' | 'audio' | 'subtitle';
  name: string;
  order: number;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  volume: number;
  clips: TimelineClip[];
}
```

Existing support:

- Multiple video, audio and subtitle tracks.
- Track ordering and video layer compositing.
- Track lock, hide and mute state.
- Track-level volume.

Missing for the target editor:

- A first-class `visual` or `image` type, unless images are deliberately represented as video-compatible clips.
- Effect tracks or effect objects.
- Track deletion rules and UI.
- Fade metadata for audio.
- Explicit track ownership through `trackId` on each clip.

### Current clip schema

```ts
{
  id: string;
  source: string;
  sourceFile: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  playbackRate?: number;
  volume: number;
  mirrorX?: boolean;
  flipY?: boolean;
  position?: { x: number; y: number; width?: number; height?: number };
  metadata?: Record<string, unknown>;
  subtitleCues?: TimelineSubtitleCue[];
  subtitleTimingMode?: SubtitleTimingMode;
  linkedVideoClipId?: string;
}
```

Existing support:

- Timeline placement, trim metadata, playback rate, volume, mirror and flip.
- Optional position metadata, although it is not yet wired through preview and export as a complete transform system.
- Subtitle cues stored in the project and mapped through shared helpers.
- OmniVoice output imported as ordinary audio clips.

Required normalization before later phases:

- Decide whether `duration` means source duration or untrimmed clip duration and document it consistently. Current code treats `trimEnd` and playback rate specially, while `trimStart` is also used as source offset.
- Add a normalized transform object instead of growing independent fields.
- Add explicit opacity, rotation, crop, fit mode and blend mode.
- Keep backwards-compatible migration for projects already saved in `localStorage`.

## 5. Preview Renderer

### Timeline preview

`TimelineEditor.tsx` renders:

- One `<video>` per visual clip.
- One `<audio>` per audio clip.
- Subtitle `<div>` elements derived from `getActiveSubtitleCues`.
- A master clock based on `requestAnimationFrame` and `project.currentTime`.

`timelinePlayback.ts` is the current synchronization boundary. It computes:

- Whether a clip is active.
- Source media time from project time.
- Visibility, mute and volume.
- Whether a media element needs a corrective seek.

The current implementation correctly avoids creating a separate clock per video element. Remaining work is to move all future visual layers and effects into the same projection and to avoid feature-specific state outside `TimelineProject`.

### Legacy preview

`VideoPreview.tsx` uses `ReactPlayer` for one video and overlays subtitle/custom text/blur state supplied by `useSubtitleMerge`. It is not driven by the multi-track `TimelineProject` and therefore cannot represent overlays, multiple video layers or timeline audio clips.

## 6. Timeline UI and Editing

`TimelineEditor.tsx` and `useTimelineEditor.ts` currently provide:

- Add video/audio/subtitle tracks.
- Add clips and queue clips sequentially.
- Select, move, duplicate, split and delete clips.
- Drag clips horizontally and between compatible tracks.
- Lock, hide and mute tracks.
- Trim fields and playback-rate editing.
- Playhead, seek, zoom and keyboard shortcuts.
- Undo/redo through project snapshots.

Known gaps against the target workflow:

- Trim handles are not yet a complete two-sided pointer interaction for every clip type.
- Drag gestures update snapshots directly; a formal mouse-down/mouse-up transaction is needed to guarantee one undo entry per gesture.
- No multi-select contract exists.
- No thumbnail/waveform rendering contract exists in the timeline UI.
- Image/logo import and visual layer manipulation are not first-class.
- Track delete UI and compatibility validation need to be formalized.

## 7. Audio and OmniVoice

Audio behavior is split as follows:

- Browser preview uses synchronized `<audio>` elements controlled by the timeline master clock.
- Export uses `buildTimelineAudioGraph`, including embedded video audio and external audio tracks.
- OmniVoice uses a persistent Python worker with CUDA/CPU selection, batch generation, deterministic seed, model reuse and clone prompt cache.
- Generated OmniVoice WAV files are imported as normal audio clips with SRT cue start times.

This is a strong foundation for Phase 12 and Phase 13. The remaining product work is audio waveform/fade UX, broader real-world decode coverage and a complete preview/export parity test project.

## 8. Subtitle

Subtitle parsing is centralized in `main/helpers/subtitleFormats.ts`. Timeline subtitle timing is centralized in `types/timelineSubtitle.ts` and is used by both preview and export.

Current support:

- SRT/VTT/ASS/LRC parsing through the existing parser.
- Absolute, linked-video and playhead timing modes.
- Multiple subtitle tracks and exclusive end boundaries.
- Realtime preview based on project time.
- Export SRT generated from the same mapped project data.

Remaining gaps:

- Full editable subtitle style/position must be stored on the timeline project rather than only in legacy merge state.
- Preview and FFmpeg style/position parity needs a dedicated validation fixture.
- Subtitle selection and interactive bounding box are not implemented in `TimelineEditor`.

## 9. Blur and Mask

The repository already has a legacy `SubtitleBlurMask` with normalized percentage fields and a CSS preview implementation in `styleUtils.ts`/`SubtitlePreviewOverlay.tsx`. This mask is intended to cover hardcoded subtitles.

Current limitation:

- It belongs to `useSubtitleMerge` state, not to a timeline effect/clip.
- It is not represented as a time-ranged effect in `TimelineProject`.
- The current timeline FFmpeg graph does not consume this legacy blur mask as a per-region compositing filter.
- It cannot yet be moved/resized directly on the multi-track preview canvas.

Therefore Phase 10 must introduce a project-owned rectangle effect and a shared preview/export representation. The existing legacy mask should be migrated or adapted, not duplicated as a second blur system.

## 10. Export

`main/helpers/timelineExporter.ts` is the multi-track export entry point. It receives a `TimelineProject` through `subtitleMerge:exportTimeline` and builds:

- Black base video.
- Ordered video overlays.
- Trim/playback-rate video filters.
- Mixed audio from video and audio tracks.
- Temporary SRT generated from timeline subtitle cues.
- Optional GPU encoder with CPU fallback.

The legacy export path is `subtitleMerger.ts`, invoked through `subtitleMerge:startMerge`. `SubtitleMergePanel` selects the timeline export when a project is available and edited; otherwise it preserves the existing legacy export.

This compatibility switch protects current functionality but is also the main reason parity is incomplete. Once image/transform/blur/effect support is added, `timelineExporter` must become the single export path for the editor workflow.

## 11. Persistence, Save/Load and Undo/Redo

Timeline projects are currently saved in renderer `localStorage` under a key derived from the video path:

```text
y18.timeline.<videoPath>
```

This preserves the basic timeline project but has limitations:

- It is not a named project file.
- It is not asset-ID based.
- Source paths can become invalid after moving files.
- Style, blur and custom overlay state are not part of the saved `TimelineProject`.
- There is no schema version or migration layer.

Undo/redo is implemented as whole-project snapshots in `useTimelineEditor`. This is simple and safe for current scale, but drag transactions need explicit grouping before interactive transform editing is added.

## 12. Asset Management

There is no dedicated asset manager or asset registry for the timeline. Clips retain direct `sourceFile` paths and construct `media://` URLs at render time.

Recommended later addition:

```ts
assets: Record<
  string,
  {
    id: string;
    sourceFile: string;
    kind: 'video' | 'audio' | 'image';
    duration?: number;
    width?: number;
    height?: number;
    probeStatus?: 'unknown' | 'ready' | 'error';
  }
>;
```

This should be additive and migrated from existing `sourceFile` values. Do not rewrite current media loading until the project schema migration is defined.

## 13. Console and Runtime Risks

Observed or known non-blocking warnings from the current test/build workflow:

- Electron security warnings caused by the existing renderer configuration (`webSecurity`/insecure content settings).
- Next/i18next warning during static generation when no i18next instance is initialized for a page.
- Webpack cache snapshot warnings during build.
- Hugging Face cache `refs/main` write warning during OmniVoice setup; cached model and inference still work.

Product-critical risks to address before release:

- Media decode errors need consistent user-facing state and no silent black preview.
- `media://` URL lifecycle and missing-file errors need centralized handling.
- Browser preview can create many media elements for dense timelines; scheduling and virtualization should be considered after correctness is locked.
- Export must reject or explicitly fallback for unsupported image codecs and unavailable GPU encoders.

## 14. Phase Plan Based on This Audit

1. Phase 1: add schema versioning, normalized transform/effect types and backwards-compatible migration while retaining current field aliases.
2. Phase 2: finish track controls, compatibility validation, thumbnails/waveforms and track deletion.
3. Phase 3: implement pointer trim handles using the existing trim math.
4. Phase 4: harden split inheritance and one-gesture undo transactions.
5. Phase 5-8: add a project-owned visual layer transform model and interactive canvas selection before adding image/video overlays.
6. Phase 9-10: migrate subtitle style and blur rectangle effects into project state and add shared preview/export primitives.
7. Phase 11-14: keep one master clock, standardize audio behavior and preserve the persistent OmniVoice worker.
8. Phase 15-16: extend the existing FFmpeg graph from the same project state and create frame-level preview/export fixtures.
9. Phase 17: UX polish only after correctness tests pass.

## 15. Phase 0 Exit Criteria

- Architecture documented: complete in this file.
- Preview and export data sources identified: complete; both paths and their divergence are explicit.
- Current tests/build baseline preserved: last verified timeline `39/39`, voice `13/13`, production build pass and OmniVoice Electron E2E pass before this audit-only change.
- No large feature implementation performed in Phase 0.
