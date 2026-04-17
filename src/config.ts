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
  /**
   * `openai` (default) uses OPENAI_API_KEY. `ollama` uses a local Ollama instance (no OpenAI bill).
   * If you switch providers, re-run `npm run index:sops` — vector dimensions must match the model.
   */
  embeddingProvider: (): "openai" | "ollama" => {
    const p = optional("EMBEDDING_PROVIDER", "openai").toLowerCase();
    return p === "ollama" ? "ollama" : "openai";
  },
  openaiApiKey: (): string => {
    const v = process.env.OPENAI_API_KEY?.trim();
    if (config.embeddingProvider() === "openai" && !v) {
      throw new Error(
        "OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai (or set EMBEDDING_PROVIDER=ollama)",
      );
    }
    return v ?? "";
  },
  embeddingModel: () =>
    optional("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),

  ollamaBaseUrl: () => optional("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
  /** e.g. nomic-embed-text (768-d); pull with: ollama pull nomic-embed-text */
  ollamaEmbeddingModel: () =>
    optional("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"),

  confluenceBaseUrl: () => required("CONFLUENCE_BASE_URL"),
  confluenceEmail: () => required("CONFLUENCE_EMAIL"),
  confluenceApiToken: () => required("CONFLUENCE_API_TOKEN"),
  /** CQL used to find SOP pages, e.g. space = TEAM and label = sop */
  confluenceSopCql: () => required("CONFLUENCE_SOP_CQL"),
  /**
   * Comma-separated Confluence page IDs of “folder” root pages. When set, results are
   * limited to those pages and every descendant (all nested pages under each root).
   */
  confluenceSopRootPageIds: (): string[] => {
    const raw = process.env.CONFLUENCE_SOP_ROOT_PAGE_IDS;
    if (!raw?.trim()) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((id) => /^\d+$/.test(id));
  },

  slackBotToken: () => required("SLACK_BOT_TOKEN"),
  slackSigningSecret: () => required("SLACK_SIGNING_SECRET"),
  slackAppToken: () => process.env.SLACK_APP_TOKEN,
  /** If set, only this channel triggers SOP matching */
  slackSupportChannelId: () => process.env.SLACK_SUPPORT_CHANNEL_ID,
  /** If true, also match on replies inside threads (default: false = root messages only) */
  slackProcessThreadReplies: () =>
    optional("SLACK_PROCESS_THREAD_REPLIES", "false") === "true",
  /**
   * If true, process messages from bots / subtype bot_message (e.g. Slack Workflow posting tickets).
   * Set SLACK_APP_ID to avoid reacting to this app's own messages.
   */
  slackAllowBotTickets: () =>
    optional("SLACK_ALLOW_BOT_TICKETS", "false") === "true",
  /** When set, ignore messages whose app_id matches (prevents loops when SLACK_ALLOW_BOT_TICKETS is true) */
  slackAppId: () => process.env.SLACK_APP_ID,

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
