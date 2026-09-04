import { app, BrowserWindow } from 'electron';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import type {
  VoiceRuntimeInfo,
  VoiceSeparationJob,
  VoiceSeparationMode,
  VoiceSeparationDevice,
  VoiceStemResult,
  VoiceDeliverable,
  VoiceOutputPreset,
  DemucsProcessingOptions,
  VoiceTranscriptionOptions,
} from '../../types/voiceSeparation';
import {
  buildDemucsArgs,
  buildStemVideoArgs,
  parseNvidiaSmiCudaVersion,
  parseNvidiaSmiQueryOutput,
  parseDemucsProgress,
  sortVoiceJobsForQueue,
  validateDemucsProcessingOptions,
  validateVoiceSpeed,
} from './voiceSeparationCore';
import { logMessage, store } from './storeManager';
import { transcribeAudioWithBuiltinWhisper } from './subtitleGenerator';
import { convertSubtitleContent, retimeSrtContent } from './subtitleFormats';
import { getMediaDurationSec } from './ffmpegHelperCore';

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
let activeProcess: ChildProcess | null = null;
let activeJobId: string | null = null;
let processing = false;
let jobs: VoiceSeparationJob[] = [];

const defaultDemucsOptions: DemucsProcessingOptions = {
  shifts: 1,
  overlap: 0.25,
  jobs: 0,
  split: true,
  bitDepth: 'int16',
  clipMode: 'rescale',
};

const defaultTranscription: VoiceTranscriptionOptions = {
  enabled: false,
  model: 'base',
  language: 'auto',
};

function stopProcessTree(child: ChildProcess) {
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
    });
    killer.on('error', (error) =>
      logMessage(`Unable to stop voice process tree: ${error}`, 'error'),
    );
    killer.unref();
    return;
  }
  child.kill('SIGKILL');
}

function assertJobNotCancelled(id: string) {
  if (jobs.find((job) => job.id === id)?.status === 'cancelled')
    throw new Error('VOICE_CANCELLED');
}

function jobsPath() {
  return path.join(app.getPath('userData'), 'voice-separation-jobs.json');
}

function notify() {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('voice-separation:update', jobs);
}

function saveJobs() {
  fs.mkdirSync(path.dirname(jobsPath()), { recursive: true });
  fs.writeFileSync(jobsPath(), JSON.stringify(jobs, null, 2), 'utf8');
  notify();
}

async function createUniqueStemPath(
  outputDirectory: string,
  baseName: string,
  stemType: VoiceStemResult['type'],
) {
  let suffix = 0;
  while (true) {
    const candidate = path.join(
      outputDirectory,
      `${baseName}_${stemType}${suffix ? `_${suffix}` : ''}.wav`,
    );
    try {
      const handle = await fs.promises.open(candidate, 'wx');
      await handle.close();
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      suffix += 1;
    }
  }
}

async function createUniqueDeliverablePath(
  outputDirectory: string,
  baseName: string,
  suffix: string,
  extension: string,
) {
  let index = 0;
  while (true) {
    const candidate = path.join(
      outputDirectory,
      `${baseName}_${suffix}${index ? `_${index}` : ''}.${extension}`,
    );
    try {
      const handle = await fs.promises.open(candidate, 'wx');
      await handle.close();
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      index += 1;
    }
  }
}

function normalizeJob(job: VoiceSeparationJob): VoiceSeparationJob {
  return {
    ...job,
    outputs: job.outputs?.length ? job.outputs : ['voice'],
    speed: job.speed ?? 1,
    keepPitch: job.keepPitch ?? true,
    keepStems: job.keepStems ?? true,
    demucs: { ...defaultDemucsOptions, ...job.demucs },
    transcription: { ...defaultTranscription, ...job.transcription },
    deliverables: job.deliverables || [],
    warnings: job.warnings || [],
  };
}

export function initializeVoiceSeparationQueue() {
  try {
    if (fs.existsSync(jobsPath()))
      jobs = JSON.parse(fs.readFileSync(jobsPath(), 'utf8'));
    jobs = jobs.map((rawJob) => {
      const job = normalizeJob(rawJob);
      return [
        'preparing',
        'separating',
        'transcribing',
        'rendering',
        'validating',
      ].includes(job.status)
        ? {
            ...job,
            status: 'failed',
            error: 'VOICE_INTERRUPTED',
            stageLabel: 'Interrupted',
          }
        : job;
    });
    saveJobs();
  } catch (error) {
    jobs = [];
    logMessage(`Voice queue initialization failed: ${error}`, 'error');
  }
}

async function probeCandidate(
  file: string,
  prefix: string[],
): Promise<VoiceRuntimeInfo | null> {
  try {
    const script =
      "import json,sys,demucs,torch,torchaudio; cuda=torch.cuda.is_available(); torch.zeros(1,device='cuda') if cuda else None; print(json.dumps({'python':sys.version.split()[0],'demucs':getattr(demucs,'__version__','unknown'),'torch':torch.__version__,'audioBackends':torchaudio.list_audio_backends(),'cuda':cuda,'gpu':torch.cuda.get_device_name(0) if cuda else None}))";
    const { stdout } = await execFileAsync(file, [...prefix, '-c', script], {
      timeout: 10000,
      windowsHide: true,
    });
    const data = JSON.parse(stdout.trim().split(/\r?\n/).pop() || '{}');
    return {
      available: true,
      pythonPath: file,
      pythonVersion: data.python,
      demucsVersion: data.demucs,
      torchVersion: data.torch,
      audioBackends: Array.isArray(data.audioBackends)
        ? data.audioBackends
        : [],
      cudaAvailable: Boolean(data.cuda),
      gpuName: data.gpu || undefined,
    };
  } catch {
    return null;
  }
}

async function probeNvidiaHardware() {
  if (process.platform !== 'win32' && process.platform !== 'linux') return null;
  try {
    const { stdout: queryOutput } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,driver_version', '--format=csv,noheader'],
      { timeout: 5000, windowsHide: true },
    );
    const parsed = parseNvidiaSmiQueryOutput(queryOutput);
    if (!parsed) return null;
    let nvidiaCudaVersion: string | undefined;
    try {
      const { stdout } = await execFileAsync('nvidia-smi', [], {
        timeout: 5000,
        windowsHide: true,
      });
      nvidiaCudaVersion = parseNvidiaSmiCudaVersion(stdout);
    } catch {
      nvidiaCudaVersion = undefined;
    }
    return { ...parsed, nvidiaCudaVersion };
  } catch {
    return null;
  }
}

function uniqueRuntimeCandidates(candidates: Array<[string, string[]]>) {
  const seen = new Set<string>();
  return candidates.filter(([file, prefix]) => {
    const key = `${file}\0${prefix.join('\0')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runtimeRoots() {
  const roots = [path.join(process.resourcesPath, 'demucs-runtime')];
  if (!app.isPackaged) {
    roots.push(
      path.join(process.cwd(), 'extraResources', 'demucs-runtime'),
      path.resolve(app.getAppPath(), '..', 'extraResources', 'demucs-runtime'),
      path.resolve(
        app.getAppPath(),
        '..',
        '..',
        'extraResources',
        'demucs-runtime',
      ),
    );
  }
  return [...new Set(roots)];
}

function bundledRuntimeCandidates(): Array<[string, string[]]> {
  return runtimeRoots().flatMap((root) =>
    process.platform === 'win32'
      ? [
          [path.join(root, 'Scripts', 'python.exe'), []],
          [path.join(root, 'python.exe'), []],
        ]
      : [
          [path.join(root, 'bin', 'python3'), []],
          [path.join(root, 'bin', 'python'), []],
          [path.join(root, 'python'), []],
        ],
  );
}

export async function probeVoiceRuntime(): Promise<VoiceRuntimeInfo> {
  const nvidia = await probeNvidiaHardware();
  const configured =
    store.get('voiceSeparationPythonPath') || process.env.Y18_DEMUCS_PYTHON;
  const candidates: Array<[string, string[]]> = [];
  if (configured) candidates.push([configured, []]);
  bundledRuntimeCandidates().forEach(([candidate, prefix]) => {
    if (fs.existsSync(candidate)) candidates.push([candidate, prefix]);
  });
  if (process.platform === 'win32')
    candidates.push(['py', ['-3']], ['python', []]);
  else candidates.push(['python3', []], ['python', []]);
  const uniqueCandidates = uniqueRuntimeCandidates(candidates);
  let pythonDetected = false;
  let audioBackendMissing = false;
  for (const [file, prefix] of uniqueCandidates) {
    try {
      await execFileAsync(file, [...prefix, '--version'], {
        timeout: 5000,
        windowsHide: true,
      });
      pythonDetected = true;
    } catch {
      continue;
    }
    const result = await probeCandidate(file, prefix);
    if (result?.audioBackends?.length)
      return {
        ...result,
        nvidiaHardwareAvailable: Boolean(nvidia),
        nvidiaDriverVersion: nvidia?.driverVersion,
        nvidiaCudaVersion: nvidia?.nvidiaCudaVersion,
        gpuName: result.gpuName || nvidia?.gpuName,
        runtimeSearchPaths: uniqueCandidates.map(([file]) => file),
      };
    if (result) audioBackendMissing = true;
  }
  return {
    available: false,
    cudaAvailable: false,
    nvidiaHardwareAvailable: Boolean(nvidia),
    nvidiaDriverVersion: nvidia?.driverVersion,
    nvidiaCudaVersion: nvidia?.nvidiaCudaVersion,
    gpuName: nvidia?.gpuName,
    runtimeSearchPaths: uniqueCandidates.map(([file]) => file),
    error: audioBackendMissing
      ? 'VOICE_AUDIO_BACKEND_MISSING'
      : pythonDetected
        ? 'VOICE_DEMUCS_OR_TORCH_MISSING'
        : 'VOICE_RUNTIME_MISSING',
  };
}

function updateJob(id: string, patch: Partial<VoiceSeparationJob>) {
  jobs = jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
  saveJobs();
}

function runProcess(
  file: string,
  args: string[],
  onLine?: (line: string) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, shell: false });
    activeProcess = child;
    let stderr = '';
    const handle = (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      text.split(/\r?\n/).forEach((line) => onLine?.(line));
    };
    child.stdout?.on('data', handle);
    child.stderr?.on('data', handle);
    child.on('error', reject);
    child.on('close', (code) => {
      activeProcess = null;
      code === 0
        ? resolve()
        : reject(new Error(stderr || `PROCESS_EXIT_${code}`));
    });
  });
}

async function renderStemVideo(
  job: VoiceSeparationJob,
  stemPath: string,
  preset: Extract<VoiceOutputPreset, 'voice-video' | 'karaoke-video'>,
) {
  const base = path.parse(job.inputFile).name;
  const target = await createUniqueDeliverablePath(
    job.outputDirectory,
    base,
    `${preset}_${job.speed}x`,
    'mp4',
  );
  const partial = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${job.id}.partial.mp4`,
  );
  await fs.promises.unlink(target).catch(() => undefined);
  try {
    const sourceDurationSec = await getMediaDurationSec(job.inputFile);
    if (!sourceDurationSec) throw new Error('VOICE_DURATION_INVALID');
    await runProcess(
      ffmpegPath,
      buildStemVideoArgs({
        inputFile: job.inputFile,
        stemFile: stemPath,
        outputFile: partial,
        speed: job.speed,
        keepPitch: job.keepPitch,
        outputDurationSec: sourceDurationSec / job.speed,
      }),
    );
    assertJobNotCancelled(job.id);
    await fs.promises.rename(partial, target);
    return target;
  } catch (error) {
    await fs.promises.unlink(partial).catch(() => undefined);
    throw error;
  }
}

async function mixInstrumentalStems(
  job: VoiceSeparationJob,
  stems: VoiceStemResult[],
) {
  const inputs = stems.filter((stem) => stem.type !== 'vocals');
  if (!inputs.length) throw new Error('VOICE_INSTRUMENTAL_MISSING');
  const base = path.parse(job.inputFile).name;
  const target = await createUniqueStemPath(
    job.outputDirectory,
    base,
    'instrumental',
  );
  await fs.promises.unlink(target).catch(() => undefined);
  try {
    const args = ['-y'];
    inputs.forEach((stem) => args.push('-i', stem.filePath));
    args.push(
      '-filter_complex',
      `${inputs.map((_, index) => `[${index}:a:0]`).join('')}amix=inputs=${inputs.length}:normalize=0,alimiter=limit=0.95[a]`,
      '-map',
      '[a]',
      '-c:a',
      'pcm_s16le',
      target,
    );
    await runProcess(ffmpegPath, args);
    return target;
  } catch (error) {
    await fs.promises.unlink(target).catch(() => undefined);
    throw error;
  }
}

async function createTranscriptionDeliverables(
  job: VoiceSeparationJob,
  vocalsPath: string,
) {
  const base = path.parse(job.inputFile).name;
  updateJob(job.id, {
    status: 'transcribing',
    progress: 62,
    stageLabel: 'Transcribing vocals',
  });
  let lastProgressUpdate = 0;
  const rawSrt = await transcribeAudioWithBuiltinWhisper({
    audioFile: vocalsPath,
    model: job.transcription.model,
    language: job.transcription.language,
    onProgress: (progress) => {
      const now = Date.now();
      if (progress < 100 && now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      updateJob(job.id, {
        progress: 62 + Math.min(100, Math.max(0, progress)) * 0.13,
        stageLabel: 'Transcribing vocals',
      });
    },
  });
  assertJobNotCancelled(job.id);
  const srtContent =
    job.speed === 1 ? rawSrt : retimeSrtContent(rawSrt, job.speed);
  const srtPath = await createUniqueDeliverablePath(
    job.outputDirectory,
    base,
    'subtitle',
    'srt',
  );
  const txtPath = await createUniqueDeliverablePath(
    job.outputDirectory,
    base,
    'transcript',
    'txt',
  );
  try {
    await fs.promises.writeFile(srtPath, srtContent, 'utf8');
    await fs.promises.writeFile(
      txtPath,
      convertSubtitleContent(rawSrt, 'srt', 'txt'),
      'utf8',
    );
  } catch (error) {
    await Promise.all([
      fs.promises.unlink(srtPath).catch(() => undefined),
      fs.promises.unlink(txtPath).catch(() => undefined),
    ]);
    throw error;
  }
  return [
    { type: 'subtitle-srt', filePath: srtPath },
    { type: 'transcript-txt', filePath: txtPath },
  ] satisfies VoiceDeliverable[];
}

async function processJob(job: VoiceSeparationJob) {
  const runtime = await probeVoiceRuntime();
  if (!runtime.available || !runtime.pythonPath)
    throw new Error('VOICE_RUNTIME_MISSING');
  if (job.device === 'gpu' && !runtime.cudaAvailable)
    throw new Error('VOICE_GPU_UNAVAILABLE');
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'y18-demucs-'),
  );
  const sourceWav = path.join(tempDir, 'source.wav');
  const demucsOut = path.join(tempDir, 'separated');
  try {
    updateJob(job.id, {
      status: 'preparing',
      progress: 2,
      stageLabel: 'Preparing audio',
    });
    await runProcess(ffmpegPath, [
      '-y',
      '-i',
      job.inputFile,
      '-vn',
      '-ar',
      '44100',
      '-ac',
      '2',
      sourceWav,
    ]);
    assertJobNotCancelled(job.id);
    updateJob(job.id, {
      status: 'separating',
      progress: 15,
      stageLabel: 'Separating stems',
    });
    const prefix =
      path.basename(runtime.pythonPath).toLowerCase() === 'py.exe' ||
      runtime.pythonPath === 'py'
        ? ['-3']
        : [];
    const resolvedDevice =
      job.device === 'auto'
        ? runtime.cudaAvailable
          ? 'gpu'
          : 'cpu'
        : job.device;
    const args = buildDemucsArgs({
      mode: job.mode,
      modelId: job.modelId,
      device: resolvedDevice,
      outputDirectory: demucsOut,
      inputFile: sourceWav,
      processing: {
        ...job.demucs,
        jobs: resolvedDevice === 'gpu' ? 0 : job.demucs.jobs,
      },
    });
    let lastProgressUpdate = 0;
    await runProcess(runtime.pythonPath, [...prefix, ...args], (line) => {
      const percent = parseDemucsProgress(line);
      const now = Date.now();
      if (
        percent !== null &&
        (percent >= 100 || now - lastProgressUpdate >= 500)
      ) {
        lastProgressUpdate = now;
        updateJob(job.id, {
          progress: 15 + percent * 0.4,
          stageLabel: 'Separating stems',
        });
      }
    });
    assertJobNotCancelled(job.id);
    const sourceDir = path.join(demucsOut, job.modelId, 'source');
    const names =
      job.mode === 'vocals'
        ? ['vocals', 'no_vocals']
        : job.modelId === 'htdemucs_6s'
          ? ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']
          : ['vocals', 'drums', 'bass', 'other'];
    await fs.promises.mkdir(job.outputDirectory, { recursive: true });
    const stemTypes: Record<string, VoiceStemResult['type']> = {
      no_vocals: 'instrumental',
      vocals: 'vocals',
      drums: 'drums',
      bass: 'bass',
      other: 'other',
      guitar: 'guitar',
      piano: 'piano',
    };
    const base = path.parse(job.inputFile).name;
    const stems: VoiceStemResult[] = [];
    for (const name of names) {
      assertJobNotCancelled(job.id);
      const source = path.join(sourceDir, `${name}.wav`);
      if (!fs.existsSync(source)) throw new Error('VOICE_OUTPUT_INVALID');
      const target = await createUniqueStemPath(
        job.outputDirectory,
        base,
        stemTypes[name],
      );
      try {
        await fs.promises.copyFile(source, target);
      } catch (error) {
        await fs.promises.unlink(target).catch(() => undefined);
        throw error;
      }
      stems.push({ type: stemTypes[name], filePath: target });
    }
    assertJobNotCancelled(job.id);
    const deliverables: VoiceDeliverable[] = [];
    const vocalsPath = stems.find((stem) => stem.type === 'vocals')?.filePath;
    let instrumentalPath = stems.find(
      (stem) => stem.type === 'instrumental',
    )?.filePath;
    if (job.outputs.includes('karaoke-video') && !instrumentalPath) {
      instrumentalPath = await mixInstrumentalStems(job, stems);
      stems.push({ type: 'instrumental', filePath: instrumentalPath });
    }
    if (!vocalsPath) throw new Error('VOICE_OUTPUT_INVALID');
    if (job.outputs.includes('voice'))
      deliverables.push({ type: 'voice', filePath: vocalsPath });
    updateJob(job.id, { stems, deliverables, progress: 60 });

    if (job.transcription.enabled) {
      const subtitles = await createTranscriptionDeliverables(job, vocalsPath);
      deliverables.push(...subtitles);
      updateJob(job.id, { deliverables, progress: 76 });
    }

    const videoOutputs = job.outputs.filter(
      (output): output is 'voice-video' | 'karaoke-video' =>
        output === 'voice-video' || output === 'karaoke-video',
    );
    for (let index = 0; index < videoOutputs.length; index += 1) {
      const output = videoOutputs[index];
      const audioPath =
        output === 'voice-video' ? vocalsPath : instrumentalPath;
      if (!audioPath) throw new Error('VOICE_INSTRUMENTAL_MISSING');
      updateJob(job.id, {
        status: 'rendering',
        progress: 78 + (index / videoOutputs.length) * 16,
        stageLabel:
          output === 'voice-video'
            ? 'Rendering voice video'
            : 'Rendering karaoke video',
      });
      const filePath = await renderStemVideo(job, audioPath, output);
      deliverables.push({ type: output, filePath });
      updateJob(job.id, { deliverables });
    }

    assertJobNotCancelled(job.id);
    updateJob(job.id, {
      status: 'validating',
      progress: 97,
      stageLabel: 'Validating deliverables',
      stems,
      deliverables,
    });
    const publishedStemPaths = new Set(
      deliverables
        .filter((item) => item.type === 'voice')
        .map((item) => item.filePath),
    );
    const publishedStems = job.keepStems
      ? stems
      : stems.filter((stem) => publishedStemPaths.has(stem.filePath));
    if (!job.keepStems) {
      await Promise.all(
        stems
          .filter((stem) => !publishedStemPaths.has(stem.filePath))
          .map((stem) =>
            fs.promises.unlink(stem.filePath).catch(() => undefined),
          ),
      );
    }
    updateJob(job.id, {
      status: 'completed',
      progress: 100,
      stageLabel: 'Completed',
      stems: publishedStems,
      deliverables,
    });
  } finally {
    await fs.promises
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    let next = sortVoiceJobsForQueue(jobs).find(
      (job) => job.status === 'queued',
    );
    while (next) {
      activeJobId = next.id;
      try {
        await processJob(next);
      } catch (error) {
        const current = jobs.find((job) => job.id === next!.id);
        const cancelled = current?.status === 'cancelled';
        if (!cancelled)
          updateJob(next.id, {
            status:
              current?.stems.length || current?.deliverables.length
                ? 'partial'
                : 'failed',
            stageLabel:
              current?.stems.length || current?.deliverables.length
                ? 'Partially completed'
                : 'Failed',
            error: error instanceof Error ? error.message : String(error),
          });
      }
      activeJobId = null;
      next = sortVoiceJobsForQueue(jobs).find((job) => job.status === 'queued');
    }
  } finally {
    processing = false;
  }
}

export function listVoiceJobs() {
  return jobs;
}

export function enqueueVoiceJobs(
  inputFiles: string[],
  options: {
    outputDirectory: string;
    mode: VoiceSeparationMode;
    modelId: string;
    device: VoiceSeparationDevice;
    outputs: VoiceOutputPreset[];
    speed: number;
    keepPitch: boolean;
    keepStems: boolean;
    demucs: DemucsProcessingOptions;
    transcription: VoiceTranscriptionOptions;
  },
) {
  validateVoiceSpeed(options.speed);
  validateDemucsProcessingOptions(options.demucs);
  const created = inputFiles.map<VoiceSeparationJob>((inputFile, index) => ({
    id: `voice-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    inputFile,
    outputDirectory: options.outputDirectory,
    mode: options.mode,
    modelId: options.modelId,
    device: options.device,
    outputs: options.outputs,
    speed: options.speed,
    keepPitch: options.keepPitch,
    keepStems: options.keepStems,
    demucs: options.demucs,
    transcription: options.transcription,
    status: 'queued',
    progress: 0,
    stageLabel: 'Queued',
    stems: [],
    deliverables: [],
    warnings: [],
    createdAt: Date.now() + index,
    attempt: 1,
  }));
  jobs = [...jobs, ...created];
  saveJobs();
  void drainQueue();
  return created;
}

export function cancelVoiceJob(id: string) {
  const job = jobs.find((item) => item.id === id);
  if (
    !job ||
    ['completed', 'partial', 'failed', 'cancelled'].includes(job.status)
  )
    return false;
  updateJob(id, { status: 'cancelled', stageLabel: 'Cancelled' });
  if (activeJobId === id && activeProcess) stopProcessTree(activeProcess);
  return true;
}

export function stopVoiceSeparationQueue() {
  if (activeProcess) stopProcessTree(activeProcess);
}

export function retryVoiceJob(id: string) {
  const job = jobs.find((item) => item.id === id);
  if (!job || !['partial', 'failed', 'cancelled'].includes(job.status))
    return false;
  updateJob(id, {
    status: 'queued',
    progress: 0,
    stageLabel: 'Queued',
    error: undefined,
    stems: [],
    deliverables: [],
    warnings: [],
    attempt: job.attempt + 1,
  });
  void drainQueue();
  return true;
}
