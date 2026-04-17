import { config } from "./config.js";

export type TextChunk = {
  text: string;
  pageId: string;
  chunkIndex: number;
};

export function chunkPageText(
  pageId: string,
  text: string,
): TextChunk[] {
  const size = config.chunkSizeChars();
  const overlap = config.chunkOverlapChars();
  const cleaned = text.trim();
  if (!cleaned) return [];

  const chunks: TextChunk[] = [];
  let i = 0;
  let idx = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + size, cleaned.length);
    const slice = cleaned.slice(i, end).trim();
    if (slice.length > 0) {
      chunks.push({ text: slice, pageId, chunkIndex: idx });
      idx += 1;
    }
    if (end >= cleaned.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}
