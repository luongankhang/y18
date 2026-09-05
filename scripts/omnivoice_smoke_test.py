"""Run a real, minimal OmniVoice inference and validate the WAV output."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='test-artifacts/omnivoice_smoke_test.wav')
    parser.add_argument('--model', default='k2-fsa/OmniVoice')
    args = parser.parse_args()

    import numpy as np
    import soundfile as sf
    import torch
    from omnivoice import OmniVoice

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    dtype = torch.float16 if device.startswith('cuda') else torch.float32
    print(f'python: {sys.executable}')
    print(f'omnivoice: {getattr(__import__("omnivoice"), "__version__", "unknown")}')
    print(f'torch: {torch.__version__}')
    print(f'torch_cuda_runtime: {torch.version.cuda}')
    print(f'device: {device}')
    if device.startswith('cuda'):
        print(f'gpu: {torch.cuda.get_device_name(0)}')
        print(f'vram: {torch.cuda.get_device_properties(0).total_memory}')

    load_started = time.perf_counter()
    model = OmniVoice.from_pretrained(args.model, device_map=device, dtype=dtype)
    load_seconds = time.perf_counter() - load_started

    text = 'Xin chào, đây là bài kiểm tra giọng nói tiếng Việt bằng OmniVoice.'
    generation_started = time.perf_counter()
    # Match the renderer payload so API regressions such as language_id vs language are caught.
    audio = model.generate(text=text, language='vi', num_step=16)
    generation_seconds = time.perf_counter() - generation_started
    waveform = audio[0] if isinstance(audio, (list, tuple)) else audio
    waveform = np.asarray(waveform, dtype=np.float32).reshape(-1)
    if not waveform.size or not np.isfinite(waveform).all():
        raise RuntimeError('Generated audio is empty or contains NaN/Inf')
    peak = float(np.max(np.abs(waveform)))
    rms = float(np.sqrt(np.mean(np.square(waveform))))
    if peak <= 1e-4 or rms <= 1e-5:
        raise RuntimeError(f'Generated audio is silent: peak={peak}, rms={rms}')
    if peak > 1.0:
        waveform = waveform / peak * 0.99
    sample_rate = int(getattr(model, 'sampling_rate', 24000))
    sf.write(output, waveform, sample_rate, subtype='PCM_16')
    duration = waveform.size / sample_rate
    print(f'output: {output}')
    print(f'sample_rate: {sample_rate}')
    print(f'duration: {duration:.3f}')
    print(f'peak: {peak:.6f}')
    print(f'rms: {rms:.6f}')
    print(f'load_seconds: {load_seconds:.3f}')
    print(f'generation_seconds: {generation_seconds:.3f}')
    print(f'real_time_factor: {generation_seconds / duration:.4f}')
    if not output.exists() or output.stat().st_size <= 0:
        raise RuntimeError('Output WAV was not written')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
