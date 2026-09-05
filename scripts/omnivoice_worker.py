"""Persistent JSONL worker for the local OmniVoice integration."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import traceback


MODEL_ID = os.environ.get('Y18_OMNIVOICE_MODEL', 'k2-fsa/OmniVoice')
WORKER_STARTED_AT = time.perf_counter()
WORKER_READY_AT = WORKER_STARTED_AT
model = None
model_device = None
model_dtype = None
model_load_count = 0
clone_prompt_cache = {}
dependencies_loaded = False

if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8')
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def emit(payload: dict) -> None:
    print('__Y18__' + json.dumps(payload, ensure_ascii=False), flush=True)


def elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 2)


def load_model(requested_device: str):
    global model, model_device, model_dtype, model_load_count, dependencies_loaded
    if dependencies_loaded:
        import torch
        from omnivoice import OmniVoice
        torch_import_ms = 0.0
        python_import_ms = 0.0
    else:
        torch_started = time.perf_counter()
        import torch
        torch_import_ms = elapsed_ms(torch_started)
        python_started = time.perf_counter()
        from omnivoice import OmniVoice
        python_import_ms = elapsed_ms(python_started)
        dependencies_loaded = True

    device = requested_device or 'cuda'
    if device == 'cuda':
        if not torch.cuda.is_available():
            raise RuntimeError('OMNIVOICE_CUDA_UNAVAILABLE')
        device = 'cuda:0'
    elif device != 'cpu':
        raise RuntimeError('OMNIVOICE_DEVICE_INVALID')

    if model is not None:
        if model_device != device:
            raise RuntimeError('OMNIVOICE_DEVICE_CHANGE_REQUIRES_WORKER_RESTART')
        return model, torch, python_import_ms, torch_import_ms, 0.0

    dtype = torch.float16 if device.startswith('cuda') else torch.float32
    emit({'event': 'phase', 'phase': 'loading_model'})
    load_started = time.perf_counter()
    model = OmniVoice.from_pretrained(MODEL_ID, device_map=device, dtype=dtype)
    model_device = device
    model_dtype = str(dtype).replace('torch.', '')
    model_load_count += 1
    return model, torch, python_import_ms, torch_import_ms, elapsed_ms(load_started)


def clone_prompt(current, request: dict):
    reference_audio = request.get('referenceAudio')
    if request.get('mode', 'auto') != 'clone' or not reference_audio:
        return None
    reference_transcript = request.get('referenceTranscript') or None
    stat = os.stat(reference_audio)
    identity = json.dumps({
        'model': MODEL_ID,
        'path': os.path.abspath(reference_audio),
        'size': stat.st_size,
        'mtime': stat.st_mtime_ns,
        'text': reference_transcript,
    }, ensure_ascii=False, sort_keys=True)
    key = hashlib.sha256(identity.encode('utf-8')).hexdigest()
    if key not in clone_prompt_cache:
        clone_prompt_cache[key] = current.create_voice_clone_prompt(
            reference_audio,
            reference_transcript,
        )
    return clone_prompt_cache[key]


def generation_kwargs(current, request: dict) -> tuple[dict, float]:
    prepare_started = time.perf_counter()
    kwargs = {}
    mode = request.get('mode', 'auto')
    if mode == 'design' and request.get('instruction'):
        kwargs['instruct'] = request['instruction']
    emit({'event': 'phase', 'phase': 'preparing_voice'})
    prompt = clone_prompt(current, request)
    if prompt is not None:
        kwargs['voice_clone_prompt'] = prompt
    if request.get('language') and request['language'] != 'auto':
        kwargs['language'] = str(request['language'])
    if request.get('speed') is not None:
        kwargs['speed'] = float(request['speed'])
    num_step = int(request.get('numStep', 16))
    if num_step < 4 or num_step > 64:
        raise RuntimeError('OMNIVOICE_NUM_STEP_INVALID')
    kwargs['num_step'] = num_step
    # Greedy sampling plus a fixed seed keeps separate SRT cues on one voice.
    kwargs['position_temperature'] = 0.0
    kwargs['class_temperature'] = 0.0
    return kwargs, elapsed_ms(prepare_started)


def normalize_and_write(current, waveform, output: str) -> tuple[dict, float]:
    import numpy as np
    import soundfile as sf

    write_started = time.perf_counter()
    waveform = np.asarray(waveform, dtype=np.float32).reshape(-1)
    if not waveform.size or not np.isfinite(waveform).all():
        raise RuntimeError('OMNIVOICE_AUDIO_INVALID')
    peak = float(np.max(np.abs(waveform)))
    rms = float(np.sqrt(np.mean(np.square(waveform))))
    if peak <= 1e-4 or rms <= 1e-5:
        raise RuntimeError('OMNIVOICE_AUDIO_SILENT')
    if peak > 1.0:
        waveform = waveform / peak * 0.99
    sample_rate = int(getattr(current, 'sampling_rate', 24000))
    sf.write(output, waveform, sample_rate, subtype='PCM_16')
    bucket_count = 96
    bucket_size = max(1, waveform.size // bucket_count)
    preview = [
        float(np.max(np.abs(waveform[index:index + bucket_size])))
        for index in range(0, waveform.size, bucket_size)
    ][:bucket_count]
    return {
        'outputPath': output,
        'duration': float(waveform.size / sample_rate),
        'sampleRate': sample_rate,
        'peak': peak,
        'rms': rms,
        'waveform': preview,
    }, elapsed_ms(write_started)


def probe_audio(ffprobe_path: str | None, output: str) -> float:
    if not ffprobe_path:
        return 0.0
    import subprocess

    probe_started = time.perf_counter()
    completed = subprocess.run(
        [
            ffprobe_path,
            '-v',
            'error',
            '-select_streams',
            'a:0',
            '-show_entries',
            'stream=codec_name,sample_rate:format=duration',
            '-of',
            'json',
            output,
        ],
        capture_output=True,
        text=True,
        encoding='utf-8',
        timeout=15,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f'OMNIVOICE_FFPROBE_FAILED:{completed.stderr.strip()}')
    data = json.loads(completed.stdout or '{}')
    if not data.get('streams'):
        raise RuntimeError('OMNIVOICE_FFPROBE_NO_AUDIO')
    return elapsed_ms(probe_started)


def diagnostics(timings: dict) -> dict:
    import torch

    return {
        'timings': timings,
        'runtime': {
            'pid': os.getpid(),
            'modelId': MODEL_ID,
            'device': model_device,
            'dtype': model_dtype,
            'gpu': torch.cuda.get_device_name(0) if model_device and model_device.startswith('cuda') else None,
            'pythonExecutable': sys.executable,
            'pythonVersion': sys.version.split()[0],
            'torchVersion': torch.__version__,
            'torchCudaRuntime': torch.version.cuda,
            'cudaAvailable': torch.cuda.is_available(),
            'cudaCount': torch.cuda.device_count(),
            'capability': list(torch.cuda.get_device_capability(0)) if torch.cuda.is_available() else None,
            'vramBytes': torch.cuda.get_device_properties(0).total_memory if torch.cuda.is_available() else None,
            'modelLoadCount': model_load_count,
            'modelInstanceId': id(model),
            'workerUptimeMs': elapsed_ms(WORKER_STARTED_AT),
        },
    }


def generate(request: dict) -> dict:
    total_started = time.perf_counter()
    text = request.get('text')
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError('OMNIVOICE_TEXT_INVALID')
    current, torch, python_import_ms, torch_import_ms, model_load_ms = load_model(request.get('device', 'cuda'))
    seed = int(request.get('seed', 2025))
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    kwargs, prompt_prep_ms = generation_kwargs(current, request)
    emit({'event': 'phase', 'phase': 'generating'})
    generation_started = time.perf_counter()
    audio = current.generate(text=text.strip(), **kwargs)
    generate_ms = elapsed_ms(generation_started)
    waveform = audio[0] if isinstance(audio, (list, tuple)) else audio
    emit({'event': 'phase', 'phase': 'writing_audio'})
    result, wav_write_ms = normalize_and_write(current, waveform, request['outputPath'])
    ffprobe_ms = probe_audio(request.get('ffprobePath'), request['outputPath'])
    timings = {
        'worker_start_ms': round((WORKER_READY_AT - WORKER_STARTED_AT) * 1000, 2),
        'python_import_ms': python_import_ms,
        'torch_import_ms': torch_import_ms,
        'model_load_ms': model_load_ms,
        'voice_prompt_prepare_ms': prompt_prep_ms,
        'generate_ms': generate_ms,
        'wav_write_ms': wav_write_ms,
        'ffprobe_ms': ffprobe_ms,
        'total_ms': elapsed_ms(total_started),
    }
    return {**result, **diagnostics(timings)}


def generate_batch(request: dict) -> dict:
    total_started = time.perf_counter()
    items = request.get('items')
    if not isinstance(items, list) or not items:
        raise RuntimeError('OMNIVOICE_BATCH_EMPTY')
    if any(not isinstance(item.get('text'), str) or not item['text'].strip() or not item.get('outputPath') for item in items):
        raise RuntimeError('OMNIVOICE_BATCH_ITEM_INVALID')
    current, torch, python_import_ms, torch_import_ms, model_load_ms = load_model(request.get('device', 'cuda'))
    seed = int(request.get('seed', 2025))
    kwargs, prompt_prep_ms = generation_kwargs(current, request)
    # Four items is the largest batch verified on the 6 GB RTX test machine.
    batch_size = max(1, min(4, int(request.get('batchSize', 4))))
    outputs = []
    generate_ms = 0.0
    wav_write_ms = 0.0
    emit({'event': 'phase', 'phase': 'generating'})
    for offset in range(0, len(items), batch_size):
        chunk = items[offset:offset + batch_size]
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        chunk_started = time.perf_counter()
        audios = current.generate(
            text=[item['text'].strip() for item in chunk],
            **kwargs,
        )
        generate_ms += elapsed_ms(chunk_started)
        if len(audios) != len(chunk):
            raise RuntimeError('OMNIVOICE_BATCH_OUTPUT_MISMATCH')
        emit({
            'event': 'phase',
            'phase': 'generating',
            'completed': min(offset + len(chunk), len(items)),
            'total': len(items),
        })
        for item, waveform in zip(chunk, audios):
            emit({'event': 'phase', 'phase': 'writing_audio'})
            output, item_write_ms = normalize_and_write(current, waveform, item['outputPath'])
            wav_write_ms += item_write_ms
            outputs.append({**output, 'itemId': item.get('id'), 'text': item['text'].strip()})
    ffprobe_ms = probe_audio(request.get('ffprobePath'), outputs[0]['outputPath'])
    timings = {
        'worker_start_ms': round((WORKER_READY_AT - WORKER_STARTED_AT) * 1000, 2),
        'python_import_ms': python_import_ms,
        'torch_import_ms': torch_import_ms,
        'model_load_ms': model_load_ms,
        'voice_prompt_prepare_ms': prompt_prep_ms,
        'generate_ms': round(generate_ms, 2),
        'wav_write_ms': round(wav_write_ms, 2),
        'ffprobe_ms': ffprobe_ms,
        'total_ms': elapsed_ms(total_started),
    }
    return {'outputs': outputs, **diagnostics(timings)}


def main() -> int:
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            command = request.get('command')
            if command in ('generate', 'generate_batch'):
                emit({'event': 'phase', 'phase': 'starting_worker', 'id': request.get('id')})
                try:
                    result = generate(request) if command == 'generate' else generate_batch(request)
                except Exception as error:
                    try:
                        import torch
                        if isinstance(error, torch.cuda.OutOfMemoryError):
                            torch.cuda.empty_cache()
                            raise RuntimeError('OMNIVOICE_CUDA_OOM: reduce batch size or use 16-step mode') from error
                    except ImportError:
                        pass
                    raise
                emit({'event': 'result', 'id': request.get('id'), 'result': result})
            elif command == 'shutdown':
                return 0
            else:
                raise RuntimeError('OMNIVOICE_COMMAND_INVALID')
        except Exception as error:
            emit({
                'event': 'error',
                'id': request.get('id') if isinstance(request, dict) else None,
                'error': str(error),
                'traceback': traceback.format_exc(),
            })
    return 0


WORKER_READY_AT = time.perf_counter()

if __name__ == '__main__':
    raise SystemExit(main())
