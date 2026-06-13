import type { TFunction } from 'i18next';

/** Translate backend message codes; show raw text when no translation exists. */
export function translateAppMessage(t: TFunction, message: string): string {
  if (!message) return message;
  const key = `messages.${message}`;
  const translated = t(key);
  return translated === key ? message : translated;
}
