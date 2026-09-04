# Demucs Customer Pipeline Plan

## Implementation status

- Completed: three selectable customer output presets.
- Completed: advanced Demucs models, quality parameters, and validation.
- Completed: manual 0.25x-4x speed with synchronized audio/video.
- Completed: reusable vocals-to-Whisper TXT/SRT stage and SRT retiming.
- Completed: persistent staged queue, partial results, cancellation, and retry.
- Completed: NVIDIA hardware/Torch CUDA diagnostics and Python runtime picker.
- Completed: portable Windows runtime builder and installer resource mapping.
- Completed: unit and real FFmpeg integration coverage.
- Environment pending: build the multi-gigabyte runtime artifact and run a real
  Demucs CUDA fixture before distributing the installer.

## 1. Customer outcome

Build one production workflow that accepts a video or audio file and provides
three explicit output presets:

1. **Voice**: export the isolated vocal track.
2. **Voice video**: export the source video with its audio replaced by the
   isolated vocal track.
3. **Karaoke video**: export the source video with its audio replaced by the
   no-vocals/instrumental track.

Every preset can also generate transcription deliverables. Video presets can
export a manually selected playback speed. The default deliverable bundle is:

- selected audio or video output;
- plain transcript (`.txt`);
- timed subtitle (`.srt`) so timestamps are not lost;
- the original Demucs stems when **Keep stems** is enabled.

This interpretation must be confirmed with the customer before release. In
particular, confirm that "video" means a video whose audio is the vocal stem,
and "nhac K" means a karaoke/no-vocals video.

## 2. Current-state findings

- Demucs currently supports two-stem and four-stem separation, a persistent
  queue, cancellation, retry, runtime probing, and CPU/GPU/Auto selection.
- The GPU option is disabled when `torch.cuda.is_available()` is false.
- This Windows host has an NVIDIA GeForce RTX 3050 and a working NVIDIA driver,
  but has no Python runtime. Demucs therefore cannot probe PyTorch CUDA and the
  GPU option is correctly unavailable with the current installation.
- The project already has reusable FFmpeg speed processing and Whisper
  subtitle generation. They are separate workflows and must be orchestrated,
  not duplicated.
- Existing speed processing supports audio/video synchronization and manual
  values up to 4x.

## 3. Product workflow

### Step 1: Input

- Select one or many audio/video files.
- Validate file existence, decodable audio stream, and video stream when a
  video output preset is selected.
- Show duration, codec, channel count, and estimated output size.

### Step 2: Output preset

- **Voice**: vocals audio only.
- **Voice video**: original visual stream plus vocals audio.
- **Karaoke video**: original visual stream plus instrumental audio.
- Allow multiple presets in one job so a customer can request the complete
  bundle without running Demucs more than once.

### Step 3: Demucs quality

Provide three safe presets and an expandable advanced section:

- **Fast**: `mdx_q`, shifts 1, overlap 0.1, int16.
- **Balanced**: `htdemucs`, shifts 1, overlap 0.25, int16.
- **Best**: `htdemucs_ft`, shifts 2, overlap 0.25, int24.

Advanced options:

- model: `htdemucs`, `htdemucs_ft`, `htdemucs_6s`, `mdx_extra`, `mdx_q`,
  `mdx_extra_q`;
- device: Auto, CPU, NVIDIA GPU;
- shifts: 0-10;
- overlap: 0.1-0.5;
- segment length: Auto or a validated model-compatible value;
- CPU jobs: Auto or 1-N; force 0 for GPU unless validated otherwise;
- split audio: enabled by default;
- output depth: int16, int24, float32;
- clipping strategy: rescale, clamp, none;
- keep intermediate stems.

Invalid combinations must be blocked before enqueue. `htdemucs_6s` exposes
guitar and piano stems and should be marked GPU-recommended.

### Step 4: GPU readiness

Replace the disabled dropdown-only behavior with a GPU readiness card:

- GPU hardware and driver detected;
- Python/Demucs runtime detected;
- Torch build and version;
- CUDA available to Torch;
- GPU name and free/total VRAM;
- model compatibility and estimated VRAM;
- actionable error and **Fix GPU setup** action.

Runtime strategy for production:

1. Package a pinned Windows Python runtime with Demucs and a CUDA-enabled Torch
   build, or provide a signed runtime package downloaded by the existing addon
   manager pattern.
2. Keep CPU as a guaranteed fallback.
3. Probe the packaged runtime with a real tensor allocation on CUDA, not only
   `torch.cuda.is_available()`.
4. Run a short warm-up and report out-of-memory separately from missing CUDA.
5. On GPU OOM, offer retry with a smaller segment or CPU; never silently change
   the selected device.

The Whisper CUDA addon and Demucs PyTorch CUDA runtime are separate components.
The UI must not report Demucs GPU-ready based on the Whisper addon alone.

### Step 5: Transcription

- Run Whisper on the isolated vocal stem, not on the original mix.
- Reuse the existing model, language, VAD, prompt, and CPU/CUDA settings.
- Produce one canonical timed subtitle result, then derive `.srt` and `.txt`.
- TXT contains readable text without timestamps.
- SRT preserves timestamps and is required for later subtitle rendering.
- If output speed differs from 1x, scale SRT timestamps by `1 / speed`.
- A transcription failure must not delete successful Demucs outputs.

### Step 6: Video rendering

- Reuse the original video stream where possible.
- Replace its audio with the selected stem and trim both to a deterministic
  duration.
- Apply manual speed to video and audio in the same FFmpeg command.
- Speed UI: slider plus numeric input, range 0.25x-4.0x, step 0.05, default 1x.
- Offer `Keep pitch` enabled by default.
- Preserve source resolution and frame rate by default.
- Use unique output paths and atomic temporary files.
- Optional later enhancement: burn the retimed SRT into the video.

## 4. Architecture changes

### Types

Extend `VoiceSeparationJob` with:

- `outputs: ('voice' | 'voice-video' | 'karaoke-video')[]`;
- `transcription: { enabled, formats, language, model, vad }`;
- `speed: number`;
- `keepPitch: boolean`;
- `keepStems: boolean`;
- `demucs: { model, shifts, overlap, segment, jobs, split, bitDepth,
clipMode }`;
- per-stage progress and generated deliverables.

Use a schema validator at the IPC boundary. Persist a schema version and migrate
existing queue records.

### Main process

Create an orchestrator with explicit stages:

1. probe input;
2. normalize audio;
3. run Demucs once;
4. transcribe vocals when requested;
5. retime subtitles when speed is not 1x;
6. render selected audio/video outputs;
7. validate duration, streams, codecs, and non-empty files;
8. atomically publish deliverables and clean temporary files.

Keep the existing Demucs process runner, FFmpeg helpers, Whisper processor, and
queue persistence. Do not duplicate their core logic.

### Renderer

- Replace the single mode select with three selectable output cards.
- Keep simple quality presets visible; place raw Demucs parameters under
  **Advanced**.
- Show GPU diagnostics next to the device selector.
- Add transcription and speed sections only when relevant.
- Show stage-level progress: Separate, Transcribe, Render, Validate.
- Display every resulting file with Preview, Reveal, and Retry-stage actions.

## 5. Implementation backlog

### P0: Requirement lock and contracts

- Confirm the meaning of the three customer outputs.
- Confirm whether subtitle must be separate only or also burned into video.
- Define filenames and overwrite behavior.
- Add versioned types and IPC validation.

Acceptance: sample payloads for all three presets are approved and invalid
payloads return stable error codes.

### P1: GPU runtime and diagnostics

- Add NVIDIA/driver/VRAM probe.
- Add Torch CUDA allocation probe and structured failure reasons.
- Build or download a pinned Demucs runtime package.
- Add runtime integrity/version checks.
- Enable GPU selection when the probe passes; otherwise leave it selectable but
  route users to the exact setup action instead of a dead disabled control.

Acceptance: RTX 3050 runs a fixture on CUDA, process GPU memory is visible in
`nvidia-smi`, and forced GPU never silently executes on CPU.

### P2: Demucs options

- Extend job types and `buildDemucsArgs`.
- Add safe presets and advanced controls.
- Validate ranges and model-specific constraints.
- Persist options across retry and app restart.

Acceptance: generated CLI arguments match every UI option, including Unicode
and space-containing paths, with no shell interpolation.

### P3: Subtitle stage

- Extract a reusable Whisper transcription service from the current task
  processor.
- Transcribe the vocal stem and create TXT plus SRT.
- Add subtitle retiming for speed changes.
- Preserve completed stems when transcription fails.

Acceptance: known speech fixture produces non-empty TXT and valid ordered SRT;
0.5x output has timestamps exactly doubled within tolerance.

### P4: Audio/video deliverables

- Add voice audio export.
- Add voice-video and karaoke-video render functions.
- Integrate manual speed and pitch preservation.
- Validate output video/audio streams and duration.

Acceptance: rendered videos have visible video, audible selected stem, correct
duration, and A/V drift below 80 ms at 0.5x, 1x, and 1.5x.

### P5: Queue UX and recovery

- Add three output cards and conditional configuration sections.
- Add per-stage progress, cancellation, retry-stage, and partial-success state.
- Restore queued jobs after restart and mark interrupted stages clearly.
- Add localized VI/EN/ZH strings and user-facing error messages.

Acceptance: no raw error codes in UI, cancel leaves no child process or partial
published output, and restart recovery is deterministic.

### P6: Release validation

- Run unit, integration, renderer, Electron, and packaged-runtime tests.
- Test CPU-only and NVIDIA machines.
- Test paths with Unicode, spaces, long filenames, read-only output, low disk,
  missing audio, unsupported codec, corrupt video, GPU OOM, cancellation, and
  app restart.
- Package and smoke-test the Windows installer on a clean machine without
  system Python.

Acceptance: the clean machine can select GPU, process the fixture, and produce
the complete requested bundle without manual dependency installation.

## 6. Required automated tests

### Unit

- Demucs argument generation for every advanced option.
- Range and incompatible-option validation.
- GPU probe error mapping.
- subtitle timestamp scaling;
- output naming and no-overwrite behavior;
- output preset to FFmpeg stream mapping.

### Integration

- Demucs fixture on CPU.
- Demucs fixture on CUDA when an NVIDIA runner is available.
- vocals-to-Whisper-to-TXT/SRT pipeline.
- voice-video and karaoke-video at 0.5x, 1x, and 1.5x.
- cancellation in every stage and retry from partial success.

### Product smoke tests

- One input and all three outputs in a single job.
- Batch inputs preserve queue order.
- App restart during Demucs and during video render.
- Packaged app on a Windows account with Unicode characters in its path.

## 7. Definition of Done

- All three customer presets are understandable without technical Demucs terms.
- GPU works on a supported NVIDIA machine and has actionable diagnostics when
  unavailable.
- A single job can create voice, voice video, karaoke video, TXT, and SRT.
- Manual speed produces synchronized video/audio and correctly retimed SRT.
- No output is overwritten and no temporary files remain after cancel/failure.
- Existing FFmpeg Helper, subtitle generation, timeline, and export tests remain
  green.
- Typecheck, lint, production build, packaged Windows smoke test, and GPU fixture
  test pass with no new console errors.
