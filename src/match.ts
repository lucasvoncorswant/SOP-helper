import { config } from "./config.js";
import { embedQuery } from "./embeddings.js";
import {
  keywordSimilarity,
  normalizeCosineForBlend,
} from "./keyword.js";
import { rerankWithCohere } from "./rerank.js";
import { normalizeTicketTextForEmbedding } from "./ticketText.js";
import {
  createVectorStore,
  type IndexedChunk,
  type SopMatch,
} from "./vectorStore.js";

/** Same structure as embedding input in indexSops (title + body) for lexical + rerank. */
function docForScoring(title: string, chunkBody: string): string {
  return `Title: ${title}\n\n${chunkBody}`;
}

function blendScores(
  cosineRaw: number,
  title: string,
  chunkBody: string,
  query: string,
  weights: { vector: number; keyword: number },
): number {
  const vecN = normalizeCosineForBlend(cosineRaw);
  const body = chunkBody?.trim();
  if (!body) return vecN;
  const kw = keywordSimilarity(query, docForScoring(title, body));
  return weights.vector * vecN + weights.keyword * kw;
}

function orderPagesByFirstHit(
  ordered: Array<{ chunk: IndexedChunk; score: number }>,
  topPages: number,
  minScore: number,
): SopMatch[] {
  const seen = new Set<string>();
  const out: SopMatch[] = [];
  for (const row of ordered) {
    if (minScore > 0 && row.score < minScore) continue;
    if (seen.has(row.chunk.pageId)) continue;
    seen.add(row.chunk.pageId);
    out.push({
      pageId: row.chunk.pageId,
      title: row.chunk.title,
      url: row.chunk.url,
      score: row.score,
    });
    if (out.length >= topPages) break;
  }
  return out;
}

export async function findTopSopsForTicketText(text: string): Promise<SopMatch[]> {
  const q = normalizeTicketTextForEmbedding(text).trim();
  if (!q) return [];
  const queryVector = await embedQuery(q);
  const store = await createVectorStore();
  const pool = config.retrievalPoolChunks();
  const weights = config.hybridWeights();
  const rerankCap = config.rerankCandidateChunks();
  const topK = config.topK();
  const minScore = config.minMatchScore();

  const rawHits = await store.queryTopChunks(queryVector, pool);

  const blended = rawHits.map((h) => ({
    chunk: h.chunk,
    combined: blendScores(
      h.score,
      h.chunk.title,
      h.chunk.text,
      q,
      weights,
    ),
  }));

  blended.sort((a, b) => b.combined - a.combined);
  const candidates = blended.slice(0, Math.max(1, rerankCap));

  const provider = config.rerankProvider();
  const cohereKey = config.cohereApiKey();

  let ordered: Array<{ chunk: IndexedChunk; score: number }>;

  if (provider === "cohere" && cohereKey && candidates.length > 0) {
    const docs = candidates.map((c) =>
      docForScoring(c.chunk.title, c.chunk.text || ""),
    );
    try {
      const rr = await rerankWithCohere(q, docs, {
        apiKey: cohereKey,
        model: config.cohereRerankModel(),
        topN: docs.length,
      });
      const rrSorted = [...rr].sort(
        (a, b) => b.relevanceScore - a.relevanceScore,
      );
      ordered = rrSorted.map((r) => ({
        chunk: candidates[r.index].chunk,
        score: r.relevanceScore,
      }));
    } catch (e) {
      console.warn("Rerank failed; using hybrid scores.", e);
      ordered = candidates.map((c) => ({
        chunk: c.chunk,
        score: c.combined,
      }));
    }
  } else {
    ordered = candidates.map((c) => ({
      chunk: c.chunk,
      score: c.combined,
    }));
  }

  return orderPagesByFirstHit(ordered, topK, minScore);
}
