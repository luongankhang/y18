import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { getPath, loadWhisperAddon } from './whisper';
import { checkCudaSupport } from './cudaUtils';
import { logMessage, store } from './storeManager';
import { formatSrtContent } from './fileUtils';
import { IFiles } from '../../types';
import { getExtraResourcesPath } from './utils';

function getNumericSetting(value: unknown, defaultValue: number): number {
  return typeof value === 'number' && isFinite(value) ? value : defaultValue;
}

function getWhisperLanguage(language?: string): string {
  if (!language || language === 'auto') {
    return 'auto';
  }

  const normalized = language.toLowerCase();
  // 所有中文变体（简体/繁体/台湾/香港等）统一映射为 zh，
  // Whisper 对 zh 的训练数据最充分，识别国语/普通话最准确；
  // 粤语请通过下拉框单独选择 yue 传入。
  if (normalized.startsWith('zh')) {
    return 'zh';
  }

  return normalized;
}

export interface BuiltinTranscriptionOptions {
  audioFile: string;
  model: string;
  language?: string;
  prompt?: string;
  maxContext?: number;
  onProgress?: (progress: number) => void;
}

/** Run the built-in Whisper addon without coupling it to a renderer task. */
export async function transcribeAudioWithBuiltinWhisper(
  options: BuiltinTranscriptionOptions,
): Promise<string> {
  const whisperModel = options.model.toLowerCase();
  const settings = store.get('settings') || {};
  const useCuda = settings.useCuda || false;
  const platform = process.platform;
  const arch = process.arch;
  let shouldUseGpu = false;
  let canUseCuda = false;

  if (platform === 'darwin' && arch === 'arm64') {
    shouldUseGpu = true;
  } else if ((platform === 'win32' || platform === 'linux') && useCuda) {
    canUseCuda = !!(await checkCudaSupport());
    shouldUseGpu = canUseCuda;
  }

  const modelPath = path.join(
    getPath('modelsPath'),
    `ggml-${whisperModel}.bin`,
  );
  if (!fs.existsSync(modelPath)) throw new Error('WHISPER_MODEL_MISSING');
  const whisper = await loadWhisperAddon(whisperModel, canUseCuda);
  const whisperAsync = promisify(whisper);

  const vadModelPath = path.join(
    getExtraResourcesPath(),
    'ggml-silero-v6.2.0.bin',
  );
  const result: any = await whisperAsync({
    language: getWhisperLanguage(options.language),
    model: modelPath,
    fname_inp: options.audioFile,
    use_gpu: shouldUseGpu,
    flash_attn: false,
    no_prints: false,
    comma_in_time: false,
    translate: false,
    no_timestamps: false,
    audio_ctx: 0,
    max_len: 0,
    print_progress: true,
    prompt: options.prompt,
    max_context: +(options.maxContext ?? -1),
    vad: settings.useVAD !== false,
    vad_model: vadModelPath,
    vad_threshold: getNumericSetting(settings.vadThreshold, 0.5),
    vad_min_speech_duration_ms: getNumericSetting(
      settings.vadMinSpeechDuration,
      250,
    ),
    vad_min_silence_duration_ms: getNumericSetting(
      settings.vadMinSilenceDuration,
      100,
    ),
    vad_max_speech_duration_s: getNumericSetting(
      settings.vadMaxSpeechDuration,
      0,
    ),
    vad_speech_pad_ms: getNumericSetting(settings.vadSpeechPad, 30),
    vad_samples_overlap: getNumericSetting(settings.vadSamplesOverlap, 0.1),
    progress_callback: (progress: number) => options.onProgress?.(progress),
  });

  return formatSrtContent(result?.transcription || []);
}

/**
 * 使用本地Whisper命令行工具生成字幕
 */
export async function generateSubtitleWithLocalWhisper(event, file, formData) {
  const { model, sourceLanguage } = formData;
  const whisperModel = model?.toLowerCase();
  const settings = store.get('settings');
  const whisperCommand = settings?.whisperCommand;
  const { tempAudioFile, srtFile, directory } = file;

  let runShell = whisperCommand
    .replace(/\${audioFile}/g, tempAudioFile)
    .replace(/\${whisperModel}/g, whisperModel)
    .replace(/\${srtFile}/g, srtFile)
    .replace(/\${sourceLanguage}/g, getWhisperLanguage(sourceLanguage))
    .replace(/\${outputDir}/g, directory);

  runShell = runShell.replace(/("[^"]*")|(\S+)/g, (match, quoted, unquoted) => {
    if (quoted) return quoted;
    if (unquoted && (unquoted.includes('/') || unquoted.includes('\\'))) {
      return `"${unquoted}"`;
    }
    return unquoted || match;
  });

  console.log(runShell, 'runShell');
  logMessage(`run shell ${runShell}`, 'info');
  event.sender.send('taskFileChange', { ...file, extractSubtitle: 'loading' });

  return new Promise((resolve, reject) => {
    exec(runShell, (error, stdout, stderr) => {
      if (error) {
        logMessage(`generate subtitle error: ${error}`, 'error');
        reject(error);
        return;
      }
      if (stderr) {
        logMessage(`generate subtitle stderr: ${stderr}`, 'warning');
      }
      if (stdout) {
        logMessage(`generate subtitle stdout: ${stdout}`, 'info');
      }
      logMessage(`generate subtitle done!`, 'info');

      const md5BaseName = path.basename(tempAudioFile, '.wav');
      const tempSrtFile = path.join(directory, `${md5BaseName}.srt`);
      if (fs.existsSync(tempSrtFile)) {
        fs.renameSync(tempSrtFile, srtFile);
      }

      event.sender.send('taskFileChange', { ...file, extractSubtitle: 'done' });
      resolve(srtFile);
    });
  });
}

/**
 * 使用内置Whisper库生成字幕
 */
export async function generateSubtitleWithBuiltinWhisper(
  event,
  file: IFiles,
  formData,
) {
  event.sender.send('taskFileChange', { ...file, extractSubtitle: 'loading' });

  try {
    const { tempAudioFile, srtFile } = file;
    const { model, sourceLanguage, prompt, maxContext } = formData;
    event.sender.send('taskProgressChange', file, 'extractSubtitle', 0);
    const formattedSrt = await transcribeAudioWithBuiltinWhisper({
      audioFile: tempAudioFile,
      model,
      language: sourceLanguage,
      prompt,
      maxContext,
      onProgress: (progress) =>
        event.sender.send(
          'taskProgressChange',
          file,
          'extractSubtitle',
          progress,
        ),
    });
    await fs.promises.writeFile(srtFile, formattedSrt);

    event.sender.send('taskFileChange', { ...file, extractSubtitle: 'done' });
    logMessage(`generate subtitle done!`, 'info');

    return srtFile;
  } catch (error) {
    logMessage(`generate subtitle error: ${error}`, 'error');
    throw error;
  }
}
