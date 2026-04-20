/**
 * Optional second-stage reranking (Cohere Rerank API).
 * https://docs.cohere.com/reference/rerank
 */

export type RerankResult = {
  index: number;
  relevanceScore: number;
};

export async function rerankWithCohere(
  query: string,
  documents: string[],
  options: { apiKey: string; model: string; topN: number },
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];

  const res = await fetch("https://api.cohere.com/v1/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      query,
      documents,
      top_n: Math.min(options.topN, documents.length),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Cohere rerank failed (${res.status}): ${errText.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as {
    results?: Array<{ index: number; relevance_score?: number }>;
  };
  const rows = data.results ?? [];
  return rows.map((r) => ({
    index: r.index,
    relevanceScore: r.relevance_score ?? 0,
  }));
}
