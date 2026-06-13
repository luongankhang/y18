import {
  modelCategories,
  models,
  type ModelCategory,
  type ModelInfo,
} from './utils';

/** Capitalize model tier segments: tiny -> Tiny, large-v3-turbo -> Large-V3-Turbo */
export function capitalizeModelName(raw: string): string {
  const name = raw.toLowerCase();
  const head = name.charAt(0).toUpperCase() + name.slice(1);
  return head.replace(/-([a-z])/g, (_, c: string) => `-${c.toUpperCase()}`);
}

/** Stable UUID-like id per model (deterministic, same across sessions) */
export function stableModelUuid(modelName: string): string {
  const seed = `y18-whisper-${modelName.toLowerCase()}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const h2 = h1 ^ 0xdeadbeef;
  const hex = (n: number, len: number) =>
    (n >>> 0).toString(16).padStart(len, '0').slice(-len);
  return `${hex(h1, 8)}-${hex(h1 >> 8, 4)}-4${hex(h2, 3)}-${['8', '9', 'a', 'b'][h2 & 3]}${hex(h2 >> 4, 3)}-${hex(h1 ^ h2, 12)}`;
}

export function formatModelDisplayName(
  rawName: string,
  options?: { shortId?: boolean },
): string {
  const display = capitalizeModelName(rawName);
  const uuid = stableModelUuid(rawName);
  const id = options?.shortId ? uuid.split('-')[0] : uuid;
  return `${display} · ${id}`;
}

export function findModelInfo(modelName: string): ModelInfo | undefined {
  return models.find((m) => m.name.toLowerCase() === modelName.toLowerCase());
}

export function findModelCategory(
  modelName: string,
): ModelCategory | undefined {
  const key = modelName.toLowerCase();
  return modelCategories.find((cat) =>
    cat.models.some((m) => m.name.toLowerCase() === key),
  );
}

export function getModelParams(modelName: string): string | undefined {
  return findModelInfo(modelName)?.params;
}
