import type { ConfluencePage } from "./confluence.js";
import { fetchSopPages } from "./confluence.js";
import { chunkPageText } from "./chunk.js";
import { config } from "./config.js";
import { embedTexts } from "./embeddings.js";
import {
  createVectorStore,
  type IndexedChunk,
  type VectorStore,
} from "./vectorStore.js";

function embeddingInputForChunk(title: string, chunkText: string): string {
  return `Title: ${title}\n\n${chunkText}`;
}

export async function indexAllSopsFromConfluence(): Promise<{
  pageCount: number;
  chunkCount: number;
}> {
  const pages = await fetchSopPages();
  const store = await createVectorStore();
  await store.clear();

  let chunkCount = 0;
  const allChunks: IndexedChunk[] = [];

  for (const p of pages) {
    const chunks = chunkPageText(p.id, p.bodyText);
    const inputs = chunks.map((c) =>
      embeddingInputForChunk(p.title, c.text),
    );
    const batchSize = 64;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const slice = inputs.slice(i, i + batchSize);
      const cslice = chunks.slice(i, i + batchSize);
      const vectors = await embedTexts(slice);
      for (let j = 0; j < cslice.length; j++) {
        const ch = cslice[j];
        allChunks.push({
          id: `${p.id}-${ch.chunkIndex}`,
          vector: vectors[j],
          pageId: p.id,
          title: p.title,
          url: p.webUrl,
          chunkIndex: ch.chunkIndex,
        });
      }
    }
    chunkCount += chunks.length;
  }

  await upsertInBatches(store, allChunks);
  return { pageCount: pages.length, chunkCount };
}

async function upsertInBatches(
  store: VectorStore,
  chunks: IndexedChunk[],
): Promise<void> {
  const batchSize = 200;
  for (let i = 0; i < chunks.length; i += batchSize) {
    await store.upsertChunks(chunks.slice(i, i + batchSize));
  }
}

/** For tests or custom page lists */
export async function indexPages(pages: ConfluencePage[]): Promise<void> {
  const store = await createVectorStore();
  await store.clear();
  const allChunks: IndexedChunk[] = [];
  for (const p of pages) {
    const chunks = chunkPageText(p.id, p.bodyText);
    const inputs = chunks.map((c) =>
      embeddingInputForChunk(p.title, c.text),
    );
    const vectors = await embedTexts(inputs);
    for (let j = 0; j < chunks.length; j++) {
      const ch = chunks[j];
      allChunks.push({
        id: `${p.id}-${ch.chunkIndex}`,
        vector: vectors[j],
        pageId: p.id,
        title: p.title,
        url: p.webUrl,
        chunkIndex: ch.chunkIndex,
      });
    }
  }
  await upsertInBatches(store, allChunks);
}
