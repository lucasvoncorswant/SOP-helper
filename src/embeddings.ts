import OpenAI from "openai";
import { config } from "./config.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: config.openaiApiKey() });
  return client;
}

async function embedTextsOpenAI(texts: string[]): Promise<number[][]> {
  const openai = getClient();
  const model = config.embeddingModel();
  const res = await openai.embeddings.create({
    model,
    input: texts,
  });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => [...d.embedding]);
}

async function embedTextsOllama(texts: string[]): Promise<number[][]> {
  const base = config.ollamaBaseUrl().replace(/\/$/, "");
  const model = config.ollamaEmbeddingModel();
  const out: number[][] = [];
  for (const prompt of texts) {
    let res: Response;
    try {
      res = await fetch(`${base}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt }),
      });
    } catch (e: unknown) {
      const nested =
        e && typeof e === "object" && "cause" in e
          ? (e as { cause?: { code?: string } }).cause
          : undefined;
      if (
        nested?.code === "ECONNREFUSED" ||
        (e as { code?: string })?.code === "ECONNREFUSED"
      ) {
        throw new Error(
          `Cannot connect to Ollama at ${base} (connection refused). Start the Ollama app, or run \`ollama serve\`, then \`ollama pull ${model}\`. To use OpenAI instead, set EMBEDDING_PROVIDER=openai and OPENAI_API_KEY in .env.`,
        );
      }
      throw e;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Ollama embeddings failed (${res.status}): ${errText.slice(0, 400)}`,
      );
    }
    const data = (await res.json()) as { embedding?: number[] };
    const emb = data.embedding;
    if (!emb?.length) {
      throw new Error("Ollama returned no embedding; is the model pulled? ollama pull " + model);
    }
    out.push([...emb]);
  }
  return out;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (config.embeddingProvider() === "ollama") {
    return embedTextsOllama(texts);
  }
  return embedTextsOpenAI(texts);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
