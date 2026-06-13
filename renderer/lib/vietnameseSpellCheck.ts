export type SpellIssueType = 'unknown' | 'missing-diacritics';

export interface SpellIssue {
  start: number;
  end: number;
  word: string;
  type: SpellIssueType;
  suggestion?: string;
}

const VI_WORD_PATTERN = /[A-Za-zÀ-ỹà-ỹ]+(?:[''][A-Za-zÀ-ỹà-ỹ]+)*/gu;

let dictionaryPromise: Promise<Set<string>> | null = null;
let unaccentedIndexPromise: Promise<Map<string, string>> | null = null;

function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, (match) => (match === 'đ' ? 'd' : 'D'));
}

async function loadDictionary(): Promise<Set<string>> {
  if (!dictionaryPromise) {
    dictionaryPromise = fetch('/dictionaries/vi-common.json')
      .then((res) => res.json())
      .then((words: string[]) => {
        const dict = new Set<string>();
        for (const word of words) {
          dict.add(word.toLowerCase());
        }
        return dict;
      })
      .catch(() => new Set<string>());
  }
  return dictionaryPromise;
}

async function loadUnaccentedIndex(): Promise<Map<string, string>> {
  if (!unaccentedIndexPromise) {
    unaccentedIndexPromise = loadDictionary().then((dict) => {
      const index = new Map<string, string>();
      for (const word of dict) {
        const key = stripDiacritics(word);
        if (!index.has(key)) {
          index.set(key, word);
        }
      }
      return index;
    });
  }
  return unaccentedIndexPromise;
}

function isLikelyProperNoun(word: string): boolean {
  return /^[A-ZÀ-Ỹ][a-zà-ỿ]+$/.test(word) && word.length > 1;
}

function isNumericToken(word: string): boolean {
  return /^\d+$/.test(word);
}

export async function checkVietnameseSpelling(
  text: string,
): Promise<SpellIssue[]> {
  if (!text.trim()) {
    return [];
  }

  const [dictionary, unaccentedIndex] = await Promise.all([
    loadDictionary(),
    loadUnaccentedIndex(),
  ]);

  const issues: SpellIssue[] = [];
  VI_WORD_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = VI_WORD_PATTERN.exec(text)) !== null) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;
    const lower = word.toLowerCase();

    if (isNumericToken(word) || word.length <= 1) {
      continue;
    }

    if (dictionary.has(lower)) {
      continue;
    }

    const unaccented = stripDiacritics(lower);
    const suggestion = unaccentedIndex.get(unaccented);

    if (suggestion && suggestion !== lower) {
      issues.push({
        start,
        end,
        word,
        type: 'missing-diacritics',
        suggestion,
      });
      continue;
    }

    if (/^[a-z]+$/.test(word) && suggestion) {
      issues.push({
        start,
        end,
        word,
        type: 'missing-diacritics',
        suggestion,
      });
      continue;
    }

    if (isLikelyProperNoun(word)) {
      continue;
    }

    issues.push({
      start,
      end,
      word,
      type: 'unknown',
      suggestion,
    });
  }

  return issues;
}

export function countSpellIssuesInCues(cueIssues: SpellIssue[][]): number {
  return cueIssues.reduce((sum, issues) => sum + issues.length, 0);
}
