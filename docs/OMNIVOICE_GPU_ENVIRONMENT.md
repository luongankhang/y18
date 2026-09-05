# OmniVoice GPU Environment

Checked on 2026-09-04.

## Demucs reference runtime

- Executable: `extraResources/demucs-runtime/python.exe`
- Python: 3.11.9
- Torch: 2.1.2+cu121
- Torch CUDA runtime: 12.1
- CUDA available: `True`
- GPU: NVIDIA GeForce RTX 3050
- Capability: `(8, 6)`
- VRAM: `6,441,926,656` bytes
- Audio backend: `soundfile`

The Demucs runtime was not modified for OmniVoice.

## OmniVoice runtime

- uv: `tools/uv.exe`, version `0.12.9`
- Managed CPython: `C:\Users\Hieu\AppData\Roaming\uv\python\cpython-3.11.16-windows-x86_64-none\python.exe`
- Project environment: `.venv-omnivoice/Scripts/python.exe`
- Python: 3.11.16
- OmniVoice: 0.2.1
- Package: `.venv-omnivoice/Lib/site-packages/omnivoice`
- Torch: 2.8.0+cu128
- Torch CUDA runtime: 12.8
- Torchaudio: 2.8.0+cu128
- NumPy: 2.4.6
- SoundFile: 0.14.0
- Transformers: 5.16.1
- CUDA available: `True`
- GPU: NVIDIA GeForce RTX 3050
- Capability: `(8, 6)`
- VRAM: `6,441,926,656` bytes

## Model/cache

- Model ID: `k2-fsa/OmniVoice`
- Cache: `C:\Users\Hieu\.cache\huggingface\hub\models--k2-fsa--OmniVoice`
- Cache size after download: approximately `3,267,472,413` bytes
- Existing cache reused: no OmniVoice files existed before this run; HTDemucs cache was preserved.
- Model downloaded once during the smoke test.

## Smoke test

- Command: `tools\\uv.exe run --python .venv-omnivoice\\Scripts\\python.exe python scripts/omnivoice_smoke_test.py`
- Text: `Xin chào, đây là bài kiểm tra giọng nói tiếng Việt bằng OmniVoice.`
- Output: `test-artifacts/omnivoice_smoke_test.wav`
- WAV size: `193,004` bytes
- FFprobe duration: `4.020000` seconds
- Codec: `pcm_s16le`
- Sample rate: `24000`
- Channels: `1`
- Peak: `0.500000`
- RMS: `0.086445`
- Cold model load: `279.669` seconds
- Generation: `1.520` seconds
- Real-time factor: `0.3782`
- Result: pass; output is non-empty, finite and non-silent.

## NVIDIA driver

`nvidia-smi` reported driver `610.62` and CUDA UMD `13.3`. Windows currently identifies the device as `NVIDIA GeForce RTX 3050`; this differs from the RTX 3060 description previously provided and should be checked against the physical machine if needed.
