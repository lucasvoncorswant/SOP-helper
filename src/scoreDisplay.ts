import type { SopMatch } from "./vectorStore.js";

/**
 * Human-facing “~NN% similarity” for Slack/CLI.
 * Prefer raw **vector** cosine (`vectorSimilarity`) so the number matches classic
 * semantic search; `score` stays the hybrid/rerank value for ordering/thresholds.
 */
export function similarityPercentValue(m: SopMatch): number {
  const v = m.vectorSimilarity;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v >= 0 && v <= 1) return v * 100;
    return ((v + 1) / 2) * 100;
  }
  const s = m.score;
  if (s >= 0 && s <= 1) return s * 100;
  return ((s + 1) / 2) * 100;
}
