import { useEffect, useState } from 'react';

export interface OutputPathPreviewData {
  fullPath: string;
  fileName: string;
  duplicateIndex: number;
}

export function useOutputPathPreview(options: {
  inputFile: string;
  outputFolder: string;
  suffix: string;
  extension: string;
}) {
  const { inputFile, outputFolder, suffix, extension } = options;
  const [preview, setPreview] = useState<OutputPathPreviewData | null>(null);

  useEffect(() => {
    if (!inputFile?.trim() || !outputFolder?.trim()) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await window?.ipc?.invoke('ffmpeg-preview-output-path', {
          outputFolder,
          inputFile,
          suffix,
          extension,
        });
        if (!cancelled) {
          setPreview(result ?? null);
        }
      } catch {
        if (!cancelled) {
          setPreview(null);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputFile, outputFolder, suffix, extension]);

  return preview;
}

export function getInputExtension(inputFile: string): string {
  const fileName = inputFile.split(/[/\\]/).pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex !== -1 ? fileName.substring(dotIndex) : '';
}
