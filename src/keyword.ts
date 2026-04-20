/** English stopwords for lightweight lexical overlap (hybrid retrieval). */
const STOPWORDS = new Set(
  [
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "as",
    "by",
    "with",
    "from",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "not",
    "no",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "we",
    "you",
    "they",
    "them",
    "their",
    "what",
    "which",
    "who",
    "when",
    "where",
    "how",
    "why",
    "if",
    "then",
    "than",
    "so",
    "such",
    "into",
    "about",
    "over",
    "after",
    "before",
    "between",
    "through",
    "during",
    "again",
    "here",
    "there",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "any",
    "can",
    "just",
    "only",
    "same",
    "very",
  ].map((w) => w.toLowerCase()),
);

export function tokenizeForKeyword(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Dice coefficient on token sets in [0, 1]. Good for short queries vs SOP snippets.
 */
export function keywordSimilarity(query: string, document: string): number {
  const q = new Set(tokenizeForKeyword(query));
  const d = new Set(tokenizeForKeyword(document));
  if (q.size === 0 || d.size === 0) return 0;
  let inter = 0;
  for (const t of q) {
    if (d.has(t)) inter += 1;
  }
  return (2 * inter) / (q.size + d.size);
}

export function normalizeCosineForBlend(cosine: number): number {
  return Math.max(0, Math.min(1, (cosine + 1) / 2));
}
