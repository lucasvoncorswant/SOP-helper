import OpenAI from "openai";
import { config } from "./config.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: config.openaiApiKey() });
  return client;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
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

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
