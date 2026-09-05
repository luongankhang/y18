import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('OmniVoice worker stays alive for JSONL commands and shuts down cleanly', async () => {
  const python = path.resolve('.venv-omnivoice/Scripts/python.exe');
  const script = path.resolve('scripts/omnivoice_worker.py');
  const child = spawn(python, [script], { windowsHide: true, stdio: 'pipe' });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk.toString()));
  child.stdin.write('{"command":"invalid"}\n');
  child.stdin.write('{"command":"shutdown"}\n');
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  assert.equal(code, 0);
  assert.match(output, /OMNIVOICE_COMMAND_INVALID/);
});
