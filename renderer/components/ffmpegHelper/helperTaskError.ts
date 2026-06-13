export function isHelperTaskCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'FFMPEG_HELPER_CANCELLED';
}

export function getHelperTaskErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
