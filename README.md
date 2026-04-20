# SOP Helper

Service that indexes Standard Operating Procedures from **Confluence** with **OpenAI** embeddings, then listens on **Slack** for new support messages and replies in the thread with the top matching SOP links (semantic search).

## How it works

1. **Index** — `npm run index:sops` runs a CQL search against Confluence, loads each page body, splits text into overlapping chunks, embeds with `text-embedding-3-small`, and stores vectors (local JSON file by default, or **Pinecone**).
2. **Match** — When someone posts in Slack (by default: a **root** message in the monitored channel), the message text is embedded and compared to stored chunks (cosine similarity). The top **3** distinct pages are returned.
3. **Reply** — The app posts those links as a reply **in the same thread** as the ticket message.

## Setup

1. Copy `.env.example` to `.env` and fill in values (see inline comments).
2. **Confluence**: use an API token tied to your Atlassian account; set `CONFLUENCE_SOP_CQL` to match only SOP pages (labels, space, etc.). Optionally set **`CONFLUENCE_SOP_ROOT_PAGE_IDS`** to one or more numeric **folder** page IDs (from the page URL or page info) to index only that page and everything nested under it (all subfolders). **Those root folder pages are not indexed or ranked**—only descendant pages are—so you do not get duplicate hits for the folder and the SOP inside it. Use **`EXCLUDE_FROM_MATCH_PAGE_IDS`** for any other navigation-only page IDs (e.g. nested folders).
3. **Slack app**: install to workspace; enable **Socket Mode** for local runs (add `SLACK_APP_TOKEN`). Grant bot scopes such as `channels:history` (or `groups:history` for private channels), `chat:write`, and subscribe to **`message.channels`** (and/or `message.groups` for private channels) under **Event Subscriptions**.
4. **Index once** (or on a schedule in production):

   ```bash
   npm install
   npm run index:sops
   ```

5. **Run the bot**:

   ```bash
   npm run dev
   ```

   Or `npm run build && npm start`.

### Manual ticket match (no Slack) — mock Slack from the console

Uses **`.data/sop-vectors.json`** and the same pipeline as the Slack bot. Commands **`npm run suggest`** and **`npm run match-ticket`** are the same script.

1. Index SOPs once: `npm run index:sops`
2. Paste a fake ticket and see suggested SOP links:

   ```bash
   pbpaste | npm run suggest
   npm run suggest < ./ticket.txt
   npm run suggest <<'EOF'
   Urgency: high
   Team: CRM
   Summary: Example issue
   Description: Full details here
   EOF
   ```

   One line: `npm run suggest -- "short question here"`.

   To print the **normalized text** sent to the embedder (debug): `DEBUG_TICKET_TEXT=1 npm run suggest -- "…"`.

Only **`OPENAI_API_KEY`** (if using OpenAI embeddings) and vector settings (e.g. **`LOCAL_VECTOR_PATH`**) are required for this command; Slack and Confluence variables are not read unless you run indexing or the Slack server.

### Embeddings without OpenAI (Ollama, local / free)

This project can use **[Ollama](https://ollama.com)** instead of the OpenAI API so you do not need OpenAI credits. **Cursor** is only an editor; it does not replace an embedding API for `npm run` commands.

1. Install Ollama and pull an embedding model, for example:

   ```bash
   ollama pull nomic-embed-text
   ```

2. In `.env` set:

   ```env
   EMBEDDING_PROVIDER=ollama
   # OPENAI_API_KEY not required for indexing/matching when using Ollama
   OLLAMA_EMBEDDING_MODEL=nomic-embed-text
   ```

3. **Keep Ollama running** (open the Ollama app or run `ollama serve`) while you index; otherwise you will see `ECONNREFUSED` on port **11434**.

4. Run **`npm run index:sops` again** after switching (dimensions change vs OpenAI). If you use Pinecone, create an index whose dimension matches the model (e.g. **768** for `nomic-embed-text`, **1536** for `text-embedding-3-small`).

## Configuration notes

- **`SLACK_SUPPORT_CHANNEL_ID`**: If set, only messages in that channel trigger matching. If omitted, any channel the bot is in will trigger (use with care). Channel IDs appear in Slack URLs (`…/archives/C0AT8QGTV8X` → `C0AT8QGTV8X`).
- **`SLACK_PROCESS_THREAD_REPLIES`**: Default `false` so only **top-level** messages are treated as new tickets. Set `true` to also match replies inside threads.
- **Structured tickets**: Messages that look like “Request Tech Support” with `Urgency` / `Team` / `Summary` / `Description` are normalized before embedding so boilerplate does not dominate the match (the model sees mainly those fields).
- **Workflow / bot posts**: If tickets are posted by Slack Workflow as `bot_message`, set **`SLACK_ALLOW_BOT_TICKETS=true`** and **`SLACK_APP_ID`** to your Slack app’s ID so the service does not reply to its own posts.
- **`VECTOR_BACKEND=local`**: Stores vectors in `LOCAL_VECTOR_PATH` (default `.data/sop-vectors.json`). Fine for moderate corpora; use **Pinecone** for large-scale or multi-instance deployments. Pinecone index dimension must match the embedding model (e.g. **1536** for OpenAI `text-embedding-3-small`, **768** for Ollama `nomic-embed-text`).

### Ticket intention and object (structured requests)

For tickets with **Urgency / Team / Summary / Description** (or “Request Tech Support” style), the matcher:

1. **Builds a richer embedding query** — e.g. “Primary actions requested: update … Subject / records involved: phone number, customer …” so dense search targets the *task*, not only raw field text.
2. **Detects action families** (update, debug, logs, reset/access, etc.) and **object terms** (phrases like `phone number`, plus salient tokens from Summary).
3. **Re-scores** each candidate chunk with an **intention/object alignment** (combined with hybrid vector+keyword scores): SOPs that match the requested action rank higher; pure “debug/PII logs” or “password reset” guides can rank lower when the ticket is clearly about **updating** CRM **phone** data, even if those docs mention “phone” in another sense.

Unstructured one-line questions still work; they skip the structured heuristics when no clear intentions/objects are found.

### Retrieval quality (chunking, hybrid, rerank, threshold)

Defaults aim for sharper matches than vector-only search at the same embedding model:

- **Chunking**: `CHUNK_SIZE_CHARS` defaults to **1200** (was 3500) with **200** overlap. Indexing still prepends **Title:** to each chunk at embed time (same as before). **Re-run `npm run index:sops`** after changing chunk settings. Chunks now store body text for keyword overlap and optional reranking.
- **Hybrid**: `HYBRID_VECTOR_WEIGHT` / `HYBRID_KEYWORD_WEIGHT` (default **0.65** / **0.35**) blend cosine similarity with a lexical overlap score (Dice on tokens, English stopwords removed).
- **Rerank**: Set **`RERANK_PROVIDER=cohere`** and **`COHERE_API_KEY`** to run [Cohere Rerank](https://docs.cohere.com/reference/rerank) on the top hybrid candidates (`RERANK_CANDIDATE_CHUNKS`, default **30**). If unset or on error, results use hybrid scores only.
- **Minimum score**: **`MIN_MATCH_SCORE`** (0–1, default **unset** = no filter) drops weak hits. With rerank, the score is Cohere’s `relevance_score`; without rerank, it is the hybrid blend. Tune on your own tickets.
- **What Slack/CLI show as %**: the **semantic (vector) cosine** for the best matching chunk on that page, not the hybrid/rerank score—so the percentage stays comparable to “classic” embedding similarity while ranking still uses hybrid + optional rerank.
- **Recall**: **`RETRIEVAL_POOL_CHUNKS`** (default **48**) is how many chunk vectors are considered before hybrid scoring.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run index:sops` | Full reindex from Confluence |
| `npm run suggest` / `npm run match-ticket` | Mock Slack input in the terminal; print suggested SOP links |
| `npm test` | Unit tests ([Vitest](https://vitest.dev/)) |
| `npm run test:watch` | Re-run tests on file changes |
| `npm run dev` | Run Slack app with `tsx watch` |
| `npm start` | Run compiled `dist/index.js` |
