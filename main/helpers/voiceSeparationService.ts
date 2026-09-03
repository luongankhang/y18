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
} from '../../types/voiceSeparation';
import { buildDemucsArgs, parseDemucsProgress } from './voiceSeparationCore';
import { logMessage } from './storeManager';

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
let activeProcess: ChildProcess | null = null;
let activeJobId: string | null = null;
let processing = false;
let jobs: VoiceSeparationJob[] = [];

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

export function initializeVoiceSeparationQueue() {
  try {
    if (fs.existsSync(jobsPath()))
      jobs = JSON.parse(fs.readFileSync(jobsPath(), 'utf8'));
    jobs = jobs.map((job) =>
      ['preparing', 'separating', 'validating'].includes(job.status)
        ? {
            ...job,
            status: 'failed',
            error: 'VOICE_INTERRUPTED',
            stageLabel: 'Interrupted',
          }
        : job,
    );
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
      "import json,sys,demucs,torch; print(json.dumps({'python':sys.version.split()[0],'demucs':getattr(demucs,'__version__','unknown'),'torch':torch.__version__,'cuda':torch.cuda.is_available(),'gpu':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}))";
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
      cudaAvailable: Boolean(data.cuda),
      gpuName: data.gpu || undefined,
    };
  } catch {
    return null;
  }
}

export async function probeVoiceRuntime(): Promise<VoiceRuntimeInfo> {
  const bundled = path.join(
    process.resourcesPath,
    'demucs-runtime',
    process.platform === 'win32' ? 'python.exe' : 'bin/python3',
  );
  const configured = process.env.Y18_DEMUCS_PYTHON;
  const candidates: Array<[string, string[]]> = [];
  if (configured) candidates.push([configured, []]);
  if (fs.existsSync(bundled)) candidates.push([bundled, []]);
  if (process.platform === 'win32')
    candidates.push(['py', ['-3']], ['python', []]);
  else candidates.push(['python3', []], ['python', []]);
  for (const [file, prefix] of candidates) {
    const result = await probeCandidate(file, prefix);
    if (result) return result;
  }
  return {
    available: false,
    cudaAvailable: false,
    error: 'VOICE_RUNTIME_MISSING',
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
    const args = buildDemucsArgs({
      mode: job.mode,
      modelId: job.modelId,
      device:
        job.device === 'auto'
          ? runtime.cudaAvailable
            ? 'gpu'
            : 'cpu'
          : job.device,
      outputDirectory: demucsOut,
      inputFile: sourceWav,
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
          progress: 15 + percent * 0.75,
          stageLabel: 'Separating stems',
        });
      }
    });
    assertJobNotCancelled(job.id);
    updateJob(job.id, {
      status: 'validating',
      progress: 92,
      stageLabel: 'Validating output',
    });
    const sourceDir = path.join(demucsOut, job.modelId, 'source');
    const names =
      job.mode === 'vocals'
        ? ['vocals', 'no_vocals']
        : ['vocals', 'drums', 'bass', 'other'];
    await fs.promises.mkdir(job.outputDirectory, { recursive: true });
    const stemTypes: Record<string, VoiceStemResult['type']> = {
      no_vocals: 'instrumental',
      vocals: 'vocals',
      drums: 'drums',
      bass: 'bass',
      other: 'other',
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
    updateJob(job.id, {
      status: 'completed',
      progress: 100,
      stageLabel: 'Completed',
      stems,
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
    let next = jobs.find((job) => job.status === 'queued');
    while (next) {
      activeJobId = next.id;
      try {
        await processJob(next);
      } catch (error) {
        const cancelled =
          jobs.find((job) => job.id === next!.id)?.status === 'cancelled';
        if (!cancelled)
          updateJob(next.id, {
            status: 'failed',
            stageLabel: 'Failed',
            error: error instanceof Error ? error.message : String(error),
          });
      }
      activeJobId = null;
      next = jobs.find((job) => job.status === 'queued');
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
  },
) {
  const created = inputFiles.map<VoiceSeparationJob>((inputFile, index) => ({
    id: `voice-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    inputFile,
    outputDirectory: options.outputDirectory,
    mode: options.mode,
    modelId: options.modelId,
    device: options.device,
    status: 'queued',
    progress: 0,
    stageLabel: 'Queued',
    stems: [],
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
  if (!job || ['completed', 'failed', 'cancelled'].includes(job.status))
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
  if (!job || !['failed', 'cancelled'].includes(job.status)) return false;
  updateJob(id, {
    status: 'queued',
    progress: 0,
    stageLabel: 'Queued',
    error: undefined,
    stems: [],
    attempt: job.attempt + 1,
  });
  void drainQueue();
  return true;
}
