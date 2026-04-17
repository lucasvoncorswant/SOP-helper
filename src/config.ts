import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  openaiApiKey: () => required("OPENAI_API_KEY"),
  embeddingModel: () =>
    optional("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),

  confluenceBaseUrl: () => required("CONFLUENCE_BASE_URL"),
  confluenceEmail: () => required("CONFLUENCE_EMAIL"),
  confluenceApiToken: () => required("CONFLUENCE_API_TOKEN"),
  /** CQL used to find SOP pages, e.g. space = TEAM and label = sop */
  confluenceSopCql: () => required("CONFLUENCE_SOP_CQL"),

  slackBotToken: () => required("SLACK_BOT_TOKEN"),
  slackSigningSecret: () => required("SLACK_SIGNING_SECRET"),
  slackAppToken: () => process.env.SLACK_APP_TOKEN,
  /** If set, only this channel triggers SOP matching */
  slackSupportChannelId: () => process.env.SLACK_SUPPORT_CHANNEL_ID,
  /** If true, also match on replies inside threads (default: false = root messages only) */
  slackProcessThreadReplies: () =>
    optional("SLACK_PROCESS_THREAD_REPLIES", "false") === "true",

  vectorBackend: () =>
    optional("VECTOR_BACKEND", "local") as "local" | "pinecone",
  pineconeApiKey: () => process.env.PINECONE_API_KEY,
  pineconeIndexName: () => process.env.PINECONE_INDEX_NAME,
  pineconeNamespace: () => optional("PINECONE_NAMESPACE", "sops"),

  localVectorPath: () =>
    optional("LOCAL_VECTOR_PATH", ".data/sop-vectors.json"),

  chunkSizeChars: () => parseInt(optional("CHUNK_SIZE_CHARS", "3500"), 10),
  chunkOverlapChars: () => parseInt(optional("CHUNK_OVERLAP_CHARS", "400"), 10),
  topK: () => parseInt(optional("TOP_K_SOPS", "3"), 10),
};
