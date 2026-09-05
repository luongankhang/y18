import { app, BrowserWindow } from 'electron';
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import ffprobeStatic from 'ffprobe-static';
import type {
  OmniVoiceBatchRequest,
  OmniVoiceJob,
  OmniVoiceRuntimeInfo,
  OmniVoiceTtsRequest,
} from '../../types/omnivoice';
import { store } from './storeManager';

const execFileAsync = promisify(execFile);
const workerScript = app.isPackaged
  ? path.join(process.resourcesPath, 'omnivoice_worker.py')
  : [
      path.join(app.getAppPath(), 'scripts', 'omnivoice_worker.py'),
      path.join(process.cwd(), 'scripts', 'omnivoice_worker.py'),
    ].find((candidate) => fs.existsSync(candidate)) ||
    path.join(process.cwd(), 'scripts', 'omnivoice_worker.py');
const modelId = 'k2-fsa/OmniVoice';
const ffprobePath = ffprobeStatic.path.replace('app.asar', 'app.asar.unpacked');
const perfDebug = process.env.OMNIVOICE_PERF_DEBUG === 'true';
let worker: ChildProcessWithoutNullStreams | null = null;
let workerBuffer = '';
let workerStderr = '';
let workerPythonPath: string | null = null;
let workerDevice: 'cuda' | 'cpu' | null = null;
let cachedRuntime: OmniVoiceRuntimeInfo | null = null;
let runtimeProbePromise: Promise<OmniVoiceRuntimeInfo> | null = null;
let queue: Array<{
  job: OmniVoiceJob;
  request: Record<string, unknown>;
  resolve: (job: OmniVoiceJob) => void;
  reject: (error: Error) => void;
}> = [];
let active: {
  job: OmniVoiceJob;
  resolve: (job: OmniVoiceJob) => void;
  reject: (error: Error) => void;
} | null = null;
let draining = false;

function notify() {
  const jobs = queue.map((item) => item.job);
  if (active) jobs.unshift(active.job);
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('omnivoice:update', jobs);
}

function runtimeCandidates() {
  const configured = store.get('omnivoicePythonPath');
  const candidates = [
    process.env.Y18_OMNIVOICE_PYTHON,
    configured,
    path.join(process.cwd(), '.venv-omnivoice', 'Scripts', 'python.exe'),
    path.join(app.getAppPath(), '.venv-omnivoice', 'Scripts', 'python.exe'),
    path.join(
      app.getAppPath(),
      '..',
      '.venv-omnivoice',
      'Scripts',
      'python.exe',
    ),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const cfg = fs.readFileSync(
        path.join(path.dirname(path.dirname(candidate)), 'pyvenv.cfg'),
        'utf8',
      );
      const home = cfg.match(/^home\s*=\s*(.+)$/m)?.[1]?.trim();
      if (home) candidates.push(path.join(home, 'python.exe'));
    } catch {
      // System Python installations do not have pyvenv.cfg.
    }
  }
  return [...new Set(candidates)];
}

export async function probeOmniVoiceRuntime(): Promise<OmniVoiceRuntimeInfo> {
  if (cachedRuntime?.available && cachedRuntime.pythonPath)
    return cachedRuntime;
  if (runtimeProbePromise) return runtimeProbePromise;
  runtimeProbePromise = probeRuntimeCandidates();
  try {
    cachedRuntime = await runtimeProbePromise;
    return cachedRuntime;
  } finally {
    runtimeProbePromise = null;
  }
}

async function probeRuntimeCandidates(): Promise<OmniVoiceRuntimeInfo> {
  const candidates = runtimeCandidates().filter((candidate) =>
    fs.existsSync(candidate),
  );
  if (!candidates.length)
    return {
      available: false,
      cudaAvailable: false,
      modelId,
      error: 'OMNIVOICE_RUNTIME_MISSING',
    };
  let lastError = 'OMNIVOICE_RUNTIME_INVALID';
  const failures: string[] = [];
  for (const pythonPath of candidates) {
    try {
      const script =
        "import json,sys,omnivoice,torch; print(json.dumps({'python':sys.version.split()[0],'omnivoice':getattr(omnivoice,'__version__','unknown'),'torch':torch.__version__,'cudaVersion':torch.version.cuda,'cuda':torch.cuda.is_available(),'gpu':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}))";
      const { stdout } = await execFileAsync(pythonPath, ['-c', script], {
        // Cold importing Torch/OmniVoice can exceed 15 seconds when Windows
        // Defender scans CUDA DLLs. This probe runs once and is then cached.
        timeout: 60000,
        windowsHide: true,
      });
      const data = JSON.parse(stdout.trim().split(/\r?\n/).pop() || '{}');
      return {
        available: true,
        pythonPath,
        pythonVersion: data.python,
        omnivoiceVersion: data.omnivoice,
        torchVersion: data.torch,
        torchCudaVersion: data.cudaVersion,
        cudaAvailable: Boolean(data.cuda),
        gpuName: data.gpu || undefined,
        modelId,
        modelCachePath:
          process.env.HF_HOME ||
          path.join(os.homedir(), '.cache', 'huggingface', 'hub'),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      failures.push(`${pythonPath}: ${lastError}`);
    }
  }
  return {
    available: false,
    cudaAvailable: false,
    pythonPath: candidates[0],
    modelId,
    error: failures.length
      ? `OMNIVOICE_RUNTIME_INVALID\n${failures.join('\n')}`
      : lastError,
  };
}

export function resetOmniVoiceRuntime() {
  cachedRuntime = null;
  runtimeProbePromise = null;
  stopOmniVoiceWorker();
}

function startWorker(pythonPath: string) {
  if (worker) return worker;
  worker = spawn(pythonPath, [workerScript], {
    cwd: app.getAppPath(),
    windowsHide: true,
    shell: false,
    stdio: 'pipe',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      Y18_OMNIVOICE_MODEL: modelId,
    },
  });
  workerStderr = '';
  workerBuffer = '';
  workerPythonPath = pythonPath;
  worker.stdout.on('data', (chunk: Buffer) => {
    workerBuffer += chunk.toString();
    const lines = workerBuffer.split(/\r?\n/);
    workerBuffer = lines.pop() || '';
    for (const line of lines) handleWorkerMessage(line);
  });
  worker.stderr.on('data', (chunk: Buffer) => {
    workerStderr = `${workerStderr}${chunk.toString()}`.slice(-4000);
    console.warn(`[OmniVoice] ${chunk.toString()}`);
  });
  worker.on('error', (error) => failActive(error));
  worker.on('close', (code) => {
    worker = null;
    workerPythonPath = null;
    workerDevice = null;
    if (active?.job.status === 'cancelled') {
      const current = active;
      active = null;
      current.resolve(current.job);
      notify();
      void drainQueue();
    } else if (active) {
      const detail = workerStderr.trim();
      failActive(
        new Error(
          `OMNIVOICE_WORKER_EXIT_${code ?? 'UNKNOWN'}${detail ? `: ${detail}` : ''}`,
        ),
      );
      void drainQueue();
    }
  });
  return worker;
}

function failActive(error: Error) {
  if (!active) return;
  const current = active;
  active = null;
  current.job.status = 'failed';
  current.job.error = error.message;
  current.reject(error);
  notify();
}

function handleWorkerMessage(line: string) {
  if (!line.startsWith('__Y18__') || !active) return;
  try {
    const message = JSON.parse(line.slice('__Y18__'.length));
    if (message.event === 'phase') {
      if (active.job.status === 'cancelled') return;
      active.job.status = message.phase;
      if (Number.isFinite(message.completed) && Number.isFinite(message.total))
        active.job.progress = {
          completed: message.completed,
          total: message.total,
        };
      notify();
    } else if (message.event === 'result') {
      if (active.job.status === 'cancelled') {
        const current = active;
        active = null;
        current.resolve(current.job);
        notify();
        void drainQueue();
        return;
      }
      active.job.status = 'completed';
      active.job.outputPath = message.result.outputPath;
      active.job.duration = message.result.duration;
      active.job.sampleRate = message.result.sampleRate;
      active.job.waveform = message.result.waveform;
      active.job.outputs = message.result.outputs;
      active.job.timings = message.result.timings;
      active.job.runtime = message.result.runtime;
      workerDevice = message.result.runtime?.device?.startsWith('cuda')
        ? 'cuda'
        : 'cpu';
      if (perfDebug)
        console.info('[OmniVoice] completed', {
          id: active.job.id,
          timings: active.job.timings,
          runtime: active.job.runtime,
          outputs: active.job.outputs?.length || 1,
        });
      const current = active;
      active = null;
      current.resolve(current.job);
      notify();
      void drainQueue();
    } else if (message.event === 'error') {
      if (active.job.status === 'cancelled') {
        const current = active;
        active = null;
        current.resolve(current.job);
        notify();
        void drainQueue();
        return;
      }
      failActive(new Error(message.error || 'OMNIVOICE_FAILED'));
      void drainQueue();
    }
  } catch (error) {
    console.warn(`[OmniVoice] invalid worker message: ${error}`);
  }
}

async function drainQueue() {
  if (draining || active || !queue.length) return;
  draining = true;
  try {
    const runtime =
      worker && workerPythonPath
        ? {
            available: true,
            cudaAvailable: true,
            pythonPath: workerPythonPath,
            modelId,
          }
        : await probeOmniVoiceRuntime();
    if (!runtime.available || !runtime.pythonPath) {
      const pending = queue.splice(0);
      pending.forEach(({ job, reject }) => {
        job.status = 'failed';
        job.error = runtime.error || 'OMNIVOICE_RUNTIME_MISSING';
        reject(new Error(job.error));
      });
      notify();
      return;
    }
    const next = queue.shift();
    if (!next) return;
    const requestedDevice = next.request.device === 'cpu' ? 'cpu' : 'cuda';
    if (worker && workerDevice && workerDevice !== requestedDevice) {
      const previousWorker = worker;
      previousWorker.kill();
      await new Promise<void>((resolve) => {
        previousWorker.once('close', () => resolve());
        setTimeout(() => {
          if (worker === previousWorker) {
            worker = null;
            workerPythonPath = null;
            workerDevice = null;
          }
          resolve();
        }, 2000);
      });
    }
    active = { job: next.job, resolve: next.resolve, reject: next.reject };
    active.job.status = 'starting_worker';
    notify();
    startWorker(runtime.pythonPath).stdin.write(
      `${JSON.stringify(next.request)}\n`,
    );
  } finally {
    draining = false;
  }
}

export async function enqueueOmniVoiceTts(
  request: OmniVoiceTtsRequest,
): Promise<OmniVoiceJob> {
  const text = request.text.trim();
  if (!text) throw new Error('OMNIVOICE_TEXT_REQUIRED');
  const speed = request.speed ?? 1;
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2)
    throw new Error('OMNIVOICE_SPEED_INVALID');
  const outputDirectory =
    request.outputDirectory ||
    path.join(app.getPath('userData'), 'omnivoice-assets');
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(
    outputDirectory,
    `tts_${Date.now()}_${crypto.randomUUID()}.wav`,
  );
  const job: OmniVoiceJob = {
    id: `omnivoice-${Date.now()}-${crypto.randomUUID()}`,
    status: 'queued',
    text,
    createdAt: Date.now(),
  };
  const promise = new Promise<OmniVoiceJob>((resolve, reject) => {
    queue.push({
      job,
      request: {
        command: 'generate',
        id: job.id,
        ...request,
        text,
        speed,
        outputDirectory,
        outputPath,
        ffprobePath,
      } as unknown as Record<string, unknown>,
      resolve,
      reject,
    });
  });
  notify();
  void drainQueue();
  return promise;
}

export async function enqueueOmniVoiceBatch(
  request: OmniVoiceBatchRequest,
): Promise<OmniVoiceJob> {
  if (!Array.isArray(request.items) || !request.items.length)
    throw new Error('OMNIVOICE_BATCH_EMPTY');
  if (request.items.length > 5000) throw new Error('OMNIVOICE_BATCH_TOO_LARGE');
  const speed = request.speed ?? 1;
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2)
    throw new Error('OMNIVOICE_SPEED_INVALID');
  const batchSize = Math.max(
    1,
    Math.min(4, Math.floor(request.batchSize || 4)),
  );
  const outputDirectory =
    request.outputDirectory ||
    path.join(app.getPath('userData'), 'omnivoice-assets');
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const id = `omnivoice-batch-${Date.now()}-${crypto.randomUUID()}`;
  const items = request.items.map((item, index) => {
    const text = item.text?.trim();
    if (!text) throw new Error(`OMNIVOICE_TEXT_REQUIRED_${index + 1}`);
    return {
      id: item.id,
      text,
      outputPath: path.join(
        outputDirectory,
        `tts_${Date.now()}_${index}_${crypto.randomUUID()}.wav`,
      ),
    };
  });
  const job: OmniVoiceJob = {
    id,
    status: 'queued',
    text: `${items.length} subtitle cues`,
    progress: { completed: 0, total: items.length },
    createdAt: Date.now(),
  };
  const promise = new Promise<OmniVoiceJob>((resolve, reject) => {
    queue.push({
      job,
      request: {
        command: 'generate_batch',
        id,
        ...request,
        items,
        speed,
        batchSize,
        outputDirectory,
        ffprobePath,
      },
      resolve,
      reject,
    });
  });
  notify();
  void drainQueue();
  return promise;
}

export function listOmniVoiceJobs(): OmniVoiceJob[] {
  return [...queue.map((item) => item.job), ...(active ? [active.job] : [])];
}

export function cancelOmniVoiceJob(id: string) {
  const queued = queue.findIndex((item) => item.job.id === id);
  if (queued >= 0) {
    const [item] = queue.splice(queued, 1);
    item.job.status = 'cancelled';
    item.resolve(item.job);
    notify();
    return true;
  }
  if (active?.job.id === id) {
    active.job.status = 'cancelled';
    // OmniVoice cannot interrupt an in-flight CUDA kernel safely. Keep the
    // worker/model alive and discard the result when this request returns.
    notify();
    return true;
  }
  return false;
}

export function stopOmniVoiceWorker() {
  if (worker) {
    worker.stdin.write('{"command":"shutdown"}\n');
    worker.kill();
    worker = null;
    workerPythonPath = null;
    workerDevice = null;
  }
}
