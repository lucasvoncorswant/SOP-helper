import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "./config.js";

export type SopMatch = {
  pageId: string;
  title: string;
  url: string;
  score: number;
};

export type IndexedChunk = {
  id: string;
  vector: number[];
  pageId: string;
  title: string;
  url: string;
  chunkIndex: number;
};

export interface VectorStore {
  clear(): Promise<void>;
  upsertChunks(chunks: IndexedChunk[]): Promise<void>;
  queryTopPages(queryVector: number[], topPages: number): Promise<SopMatch[]>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function dedupeTopPages(
  scored: Array<{ score: number; pageId: string; title: string; url: string }>,
  topPages: number,
): SopMatch[] {
  const seen = new Set<string>();
  const out: SopMatch[] = [];
  for (const row of scored.sort((x, y) => y.score - x.score)) {
    if (seen.has(row.pageId)) continue;
    seen.add(row.pageId);
    out.push({
      pageId: row.pageId,
      title: row.title,
      url: row.url,
      score: row.score,
    });
    if (out.length >= topPages) break;
  }
  return out;
}

export class LocalJsonVectorStore implements VectorStore {
  private chunks: IndexedChunk[] = [];
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as { chunks: IndexedChunk[] };
      this.chunks = parsed.chunks ?? [];
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e;
      this.chunks = [];
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify({ chunks: this.chunks }),
      "utf8",
    );
  }

  async clear(): Promise<void> {
    this.chunks = [];
    await this.save();
  }

  async upsertChunks(chunks: IndexedChunk[]): Promise<void> {
    const byId = new Map(this.chunks.map((c) => [c.id, c]));
    for (const c of chunks) byId.set(c.id, c);
    this.chunks = [...byId.values()];
    await this.save();
  }

  async queryTopPages(queryVector: number[], topPages: number): Promise<SopMatch[]> {
    await this.load();
    const chunkTop = Math.min(this.chunks.length, Math.max(topPages * 8, topPages));
    const scored = this.chunks
      .map((c) => ({
        score: cosineSimilarity(queryVector, c.vector),
        pageId: c.pageId,
        title: c.title,
        url: c.url,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, chunkTop);
    return dedupeTopPages(scored, topPages);
  }
}

export class PineconeVectorStore implements VectorStore {
  private pc: Pinecone;
  private indexName: string;
  private namespace: string;

  constructor() {
    const key = config.pineconeApiKey();
    const name = config.pineconeIndexName();
    if (!key || !name) {
      throw new Error(
        "PINECONE_API_KEY and PINECONE_INDEX_NAME are required when VECTOR_BACKEND=pinecone",
      );
    }
    this.pc = new Pinecone({ apiKey: key });
    this.indexName = name;
    this.namespace = config.pineconeNamespace();
  }

  private index() {
    return this.pc.index(this.indexName);
  }

  async clear(): Promise<void> {
    await this.index().namespace(this.namespace).deleteAll();
  }

  async upsertChunks(chunks: IndexedChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const batchSize = 100;
    const ns = this.index().namespace(this.namespace);
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await ns.upsert(
        batch.map((c) => ({
          id: c.id,
          values: c.vector,
          metadata: {
            pageId: c.pageId,
            title: c.title,
            url: c.url,
            chunkIndex: c.chunkIndex,
          },
        })),
      );
    }
  }

  async queryTopPages(queryVector: number[], topPages: number): Promise<SopMatch[]> {
    const topK = Math.max(topPages * 8, topPages);
    const res = await this
      .index()
      .namespace(this.namespace)
      .query({
        topK,
        vector: queryVector,
        includeMetadata: true,
      });

    const scored =
      res.matches?.map((m) => ({
        score: m.score ?? 0,
        pageId: String(m.metadata?.pageId ?? ""),
        title: String(m.metadata?.title ?? "Untitled"),
        url: String(m.metadata?.url ?? ""),
      })) ?? [];

    return dedupeTopPages(scored, topPages);
  }
}

export async function createVectorStore(): Promise<VectorStore> {
  const backend = config.vectorBackend();
  if (backend === "pinecone") {
    return new PineconeVectorStore();
  }
  const store = new LocalJsonVectorStore(config.localVectorPath());
  await store.load();
  return store;
}
