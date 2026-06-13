import path from 'path';
import fs from 'fs';

export interface BuildOutputPathOptions {
  outputFolder: string;
  /** Full path or basename of the source file */
  inputFile: string;
  /** Inserted before extension, e.g. `_speed_1.25` */
  suffix?: string;
  /** With or without leading dot, e.g. `.mp4` or `mp4` */
  extension: string;
  /** When true (default), append (1), (2)... if file already exists */
  ensureUnique?: boolean;
}

export interface UniqueOutputPathResult {
  fullPath: string;
  fileName: string;
  directory: string;
  /** 0 = original name, 1+ = duplicate index used in `name (n).ext` */
  duplicateIndex: number;
}

/** Strip path and extension from input file name. */
export function getBaseNameFromInput(inputFile: string): string {
  const inputFileName = path.basename(inputFile);
  const lastDotIndex = inputFileName.lastIndexOf('.');
  return lastDotIndex !== -1
    ? inputFileName.substring(0, lastDotIndex)
    : inputFileName;
}

/** Normalize extension to include a leading dot. */
export function normalizeExtension(extension: string): string {
  if (!extension) return '';
  return extension.startsWith('.') ? extension : `.${extension}`;
}

/** Build output file name without directory, e.g. `clip_speed_1.00.mp4`. */
export function buildOutputFileName(
  baseName: string,
  suffix: string,
  extension: string,
  duplicateIndex = 0,
): string {
  const ext = normalizeExtension(extension);
  const stem =
    duplicateIndex > 0
      ? `${baseName}${suffix} (${duplicateIndex})`
      : `${baseName}${suffix}`;
  return `${stem}${ext}`;
}

/**
 * Resolve a unique file path inside a directory.
 * If `fileName` exists, tries `name (1).ext`, `name (2).ext`, ...
 */
export function resolveUniqueOutputPath(
  directory: string,
  fileName: string,
  options?: { maxAttempts?: number },
): UniqueOutputPathResult {
  const maxAttempts = options?.maxAttempts ?? 9999;
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  const normalizedDir = path.normalize(directory);

  const makeResult = (
    duplicateIndex: number,
    name: string,
  ): UniqueOutputPathResult => ({
    fullPath: path.join(normalizedDir, name),
    fileName: name,
    directory: normalizedDir,
    duplicateIndex,
  });

  const baseCandidate = path.join(normalizedDir, fileName);
  if (!fs.existsSync(baseCandidate)) {
    return makeResult(0, fileName);
  }

  for (let n = 1; n <= maxAttempts; n++) {
    const duplicateName = `${stem} (${n})${ext}`;
    const duplicatePath = path.join(normalizedDir, duplicateName);
    if (!fs.existsSync(duplicatePath)) {
      return makeResult(n, duplicateName);
    }
  }

  throw new Error('UNIQUE_OUTPUT_PATH_EXHAUSTED');
}

/** Build output path from source file + suffix + extension. */
export function buildOutputPath(options: BuildOutputPathOptions): string {
  const {
    outputFolder,
    inputFile,
    suffix = '',
    extension,
    ensureUnique = true,
  } = options;

  const baseName = getBaseNameFromInput(inputFile);
  const fileName = buildOutputFileName(baseName, suffix, extension);

  if (!ensureUnique) {
    return path.join(outputFolder, fileName);
  }

  return resolveUniqueOutputPath(outputFolder, fileName).fullPath;
}

/** Ensure parent directory exists and return a unique output path. */
export function prepareUniqueOutputFile(outputFile: string): string {
  const directory = path.dirname(outputFile);
  const fileName = path.basename(outputFile);
  fs.mkdirSync(directory, { recursive: true });
  return resolveUniqueOutputPath(directory, fileName).fullPath;
}

/** Preview unique output path without creating directories. */
export function previewUniqueOutputPath(
  options: BuildOutputPathOptions,
): UniqueOutputPathResult | null {
  const { outputFolder, inputFile, suffix = '', extension } = options;

  if (!outputFolder?.trim() || !inputFile?.trim()) {
    return null;
  }

  const baseName = getBaseNameFromInput(inputFile);
  const fileName = buildOutputFileName(baseName, suffix, extension);

  try {
    return resolveUniqueOutputPath(outputFolder, fileName);
  } catch {
    return null;
  }
}
