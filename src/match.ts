import { config } from "./config.js";
import { embedQuery } from "./embeddings.js";
import { normalizeTicketTextForEmbedding } from "./ticketText.js";
import { createVectorStore, type SopMatch } from "./vectorStore.js";

export async function findTopSopsForTicketText(text: string): Promise<SopMatch[]> {
  const q = normalizeTicketTextForEmbedding(text).trim();
  if (!q) return [];
  const vector = await embedQuery(q);
  const store = await createVectorStore();
  return store.queryTopPages(vector, config.topK());
}
