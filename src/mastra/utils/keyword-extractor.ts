import natural from "natural";

export function extractKeywords(input: string): string[] {
  const stopwords = new Set([
    "find","show","latest","remote","job","jobs","for","me","the","a","an",
    "and","or","is","are","was","be","i","want","get","in","on","at","to","from",
    "with","of","by","about","as","you","we","they","your","my","our","their",
    "this","that","can","will","should","could","may","also","then","so","such",
    "here","there","all","any","each","other","some","many","most","few",
    "over","under","up","down","into","out","off","about","after","before",
    "during","while","between","within","without","like","just","now","new",
    "available","opportunity","position","role","apply","application","looking",
    "needed","required","responsibilities","experience","skills","team","work",
    "working","company","companies","organization","industry","fulltime","parttime",
    "contract","freelance","permanent","temporary","immediate","join","hiring",
    "lookingfor","open","opens","posting","post","posted","recent","updated"
  ]);

  const stemmer = natural.PorterStemmer;

  const words = input
    .toLowerCase()
    .replace(/[^\w\s+.#]/g, "") // keep . + # for tech terms
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word))
    .map(word => stemmer.stem(word)); // reduce to root

  return [...new Set(words)]; // remove duplicates
}

/**
 * Extracts a numeric limit from user text (e.g., "find 5 latest" -> 5).
 * Returns undefined if not found.
 */
export function extractLimit(input: string): number | undefined {
  if (!input) return undefined;
  const m = input.match(/\b(\d{1,3})\b/);
  if (m && m[1]) return Number(m[1]);

  // Handle common words like "one", "two", "three" up to ten
  const wordToNum: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const tokens = input.toLowerCase().split(/\s+/);
  for (const t of tokens) {
    if (wordToNum[t]) return wordToNum[t];
  }

  return undefined;
}

/**
 * Extracts a candidate location string from user text (e.g., "in London", "remote").
 * Returns undefined if not found.
 */
export function extractLocation(input: string): string | undefined {
  if (!input) return undefined;
  const lower = input.toLowerCase();
  if (lower.includes('remote')) return 'remote';

  const m = lower.match(/\bin\s+([a-z0-9 .,-]+)/i);
  if (m && m[1]) return m[1].trim();
  return undefined;
}

/**
 * Extracts a seniority level from user text (e.g., senior, junior, mid).
 */
export function extractLevel(input: string): string | undefined {
  if (!input) return undefined;
  const lower = input.toLowerCase();
  const levels = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];
  for (const l of levels) {
    if (lower.includes(l)) return l;
  }
  return undefined;
}
