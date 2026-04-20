import { config } from "./config.js";
import { embedQuery } from "./embeddings.js";
import {
  keywordSimilarity,
  normalizeCosineForBlend,
} from "./keyword.js";
import { rerankWithCohere } from "./rerank.js";
import {
  extractTicketSemantics,
  intentionObjectAlignment,
} from "./ticketSemantics.js";
import { normalizeTicketTextForEmbedding } from "./ticketText.js";
import {
  createVectorStore,
  type ChunkHit,
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
  keywordQuery: string,
  weights: { vector: number; keyword: number },
): number {
  const vecN = normalizeCosineForBlend(cosineRaw);
  const body = chunkBody?.trim();
  if (!body) return vecN;
  const kw = keywordSimilarity(keywordQuery, docForScoring(title, body));
  return weights.vector * vecN + weights.keyword * kw;
}

/** Blend dense+lexical score with intention/object fit (down-ranks wrong-action matches). */
function applyIntentionObjectFit(
  combined: number,
  alignment: number,
): number {
  const mix = 0.28 + 0.72 * alignment;
  return combined * mix;
}

function maxCosineByPage(hits: ChunkHit[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of hits) {
    const prev = m.get(h.chunk.pageId);
    if (prev === undefined || h.score > prev) {
      m.set(h.chunk.pageId, h.score);
    }
  }
  return m;
}

function orderPagesByFirstHit(
  ordered: Array<{ chunk: IndexedChunk; score: number }>,
  topPages: number,
  minScore: number,
  semanticByPage: Map<string, number>,
): SopMatch[] {
  const seen = new Set<string>();
  const out: SopMatch[] = [];
  for (const row of ordered) {
    if (minScore > 0 && row.score < minScore) continue;
    if (seen.has(row.chunk.pageId)) continue;
    seen.add(row.chunk.pageId);
    const pid = row.chunk.pageId;
    const vectorSim = semanticByPage.get(pid);
    out.push({
      pageId: pid,
      title: row.chunk.title,
      url: row.chunk.url,
      score: row.score,
      vectorSimilarity: vectorSim,
    });
    if (out.length >= topPages) break;
  }

  out.sort((a, b) => {
    const va = a.vectorSimilarity;
    const vb = b.vectorSimilarity;
    const hasA = typeof va === "number" && Number.isFinite(va);
    const hasB = typeof vb === "number" && Number.isFinite(vb);
    if (hasA && hasB && vb !== va) return vb - va;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return out;
}

export async function findTopSopsForTicketText(text: string): Promise<SopMatch[]> {
  const qNorm = normalizeTicketTextForEmbedding(text).trim();
  if (!qNorm) return [];
  const sem = extractTicketSemantics(text);
  const queryVector = await embedQuery(sem.embeddingQuery.trim());
  const store = await createVectorStore();
  const pool = config.retrievalPoolChunks();
  const weights = config.hybridWeights();
  const rerankCap = config.rerankCandidateChunks();
  const topK = config.topK();
  const minScore = config.minMatchScore();

  const excludedFolders = config.matchExcludedFolderPageIds();
  const rawHitsAll = await store.queryTopChunks(queryVector, pool);
  const rawHits = rawHitsAll.filter((h) => !excludedFolders.has(h.chunk.pageId));
  const semanticByPage = maxCosineByPage(rawHits);

  const blended = rawHits.map((h) => {
    const base = blendScores(
      h.score,
      h.chunk.title,
      h.chunk.text,
      sem.keywordQuery,
      weights,
    );
    const alignment = intentionObjectAlignment(
      sem,
      h.chunk.title,
      h.chunk.text || "",
    );
    return {
      chunk: h.chunk,
      combined: applyIntentionObjectFit(base, alignment),
    };
  });

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
      const rr = await rerankWithCohere(sem.embeddingQuery.trim(), docs, {
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

  return orderPagesByFirstHit(ordered, topK, minScore, semanticByPage);
}
