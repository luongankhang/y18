import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffprobeStatic from 'ffprobe-static';

const python = path.resolve('.venv-omnivoice/Scripts/python.exe');
const workerScript = path.resolve('scripts/omnivoice_worker.py');
const artifactDirectory = path.resolve('test-artifacts');
const text = 'Xin chào, đây là bài kiểm tra tốc độ OmniVoice.';
const ffprobePath = ffprobeStatic.path;
fs.mkdirSync(artifactDirectory, { recursive: true });

const child = spawn(python, [workerScript], {
  windowsHide: true,
  stdio: 'pipe',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

for (let index = 0; index < 3; index += 1) {
  child.stdin.write(`${JSON.stringify({
    command: 'generate',
    id: `stable-${index}`,
    text,
    mode: 'auto',
    language: 'vi',
    speed: 1,
    numStep: 16,
    seed: 2025,
    device: 'cuda',
    outputPath: path.join(artifactDirectory, `omnivoice_stable_${index}.wav`),
    ffprobePath,
  })}\n`);
}

const batchItems = Array.from({ length: 4 }, (_, index) => ({
  id: `batch-cue-${index}`,
  text,
  outputPath: path.join(artifactDirectory, `omnivoice_batch_${index}.wav`),
}));
child.stdin.write(`${JSON.stringify({
  command: 'generate_batch',
  id: 'batch-four',
  items: batchItems,
  mode: 'auto',
  language: 'vi',
  speed: 1,
  numStep: 16,
  seed: 2025,
  device: 'cuda',
  batchSize: 4,
  ffprobePath,
})}\n`);
const cloneReference = path.join(artifactDirectory, 'omnivoice_stable_0.wav');
for (let index = 0; index < 2; index += 1) {
  child.stdin.write(`${JSON.stringify({
    command: 'generate',
    id: `clone-${index}`,
    text: 'Đây là bài kiểm tra cache giọng nói.',
    mode: 'clone',
    language: 'vi',
    referenceAudio: cloneReference,
    referenceTranscript: text,
    speed: 1,
    numStep: 16,
    seed: 2025,
    device: 'cuda',
    outputPath: path.join(artifactDirectory, `omnivoice_clone_${index}.wav`),
    ffprobePath,
  })}\n`);
}
child.stdin.end();

const timeout = setTimeout(() => child.kill(), 240_000);
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
clearTimeout(timeout);

assert.equal(code, 0, stderr);
const messages = stdout
  .split(/\r?\n/)
  .filter((line) => line.startsWith('__Y18__'))
  .map((line) => JSON.parse(line.slice('__Y18__'.length)));
const error = messages.find((message) => message.event === 'error');
assert.equal(error, undefined, `${error?.error || ''}\n${error?.traceback || ''}`);
const results = messages
  .filter((message) => message.event === 'result')
  .map((message) => message.result);
assert.equal(results.length, 6, 'three singles, one batch and two clones must finish');

const singles = results.slice(0, 3);
for (const [index, result] of singles.entries()) {
  assert.ok(result.duration > 0);
  assert.equal(result.sampleRate, 24000);
  assert.ok(result.waveform.length > 0);
  assert.ok(fs.statSync(path.join(artifactDirectory, `omnivoice_stable_${index}.wav`)).size > 1024);
  assert.equal(result.runtime.pid, singles[0].runtime.pid, 'worker PID must remain stable');
  assert.equal(result.runtime.modelLoadCount, 1, 'model must load once');
}
assert.ok(singles[0].timings.model_load_ms > 0, 'first request must include model load');
assert.equal(singles[1].timings.model_load_ms, 0);
assert.equal(singles[2].timings.model_load_ms, 0);
assert.deepEqual(singles[0].waveform, singles[1].waveform);
assert.deepEqual(singles[1].waveform, singles[2].waveform);

const batch = results[3];
assert.equal(batch.outputs.length, 4);
assert.equal(batch.runtime.pid, singles[0].runtime.pid);
assert.equal(batch.runtime.modelLoadCount, 1);
assert.equal(batch.timings.model_load_ms, 0);
for (const item of batch.outputs)
  assert.ok(fs.statSync(item.outputPath).size > 1024);
assert.deepEqual(batch.outputs[0].waveform, batch.outputs[1].waveform);
const clones = results.slice(4);
assert.equal(clones.length, 2);
assert.ok(clones[0].timings.voice_prompt_prepare_ms > 0);
assert.ok(
  clones[1].timings.voice_prompt_prepare_ms <
    clones[0].timings.voice_prompt_prepare_ms,
  'second identical clone must reuse its encoded prompt',
);
assert.deepEqual(clones[0].waveform, clones[1].waveform);

console.log(JSON.stringify({
  runtime: batch.runtime,
  runs: singles.map((result, index) => ({
    run: index + 1,
    pid: result.runtime.pid,
    model_load_ms: result.timings.model_load_ms,
    generate_ms: result.timings.generate_ms,
    total_ms: result.timings.total_ms,
    ffprobe_ms: result.timings.ffprobe_ms,
    audio_duration: result.duration,
    real_time_factor: Number(
      (result.timings.generate_ms / 1000 / result.duration).toFixed(3),
    ),
  })),
  batch: batch.timings,
  batchItems: batch.outputs.length,
  clonePromptPrepareMs: clones.map(
    (result) => result.timings.voice_prompt_prepare_ms,
  ),
}, null, 2));
