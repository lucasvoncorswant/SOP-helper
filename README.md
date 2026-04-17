# SOP Helper

Service that indexes Standard Operating Procedures from **Confluence** with **OpenAI** embeddings, then listens on **Slack** for new support messages and replies in the thread with the top matching SOP links (semantic search).

## How it works

1. **Index** — `npm run index:sops` runs a CQL search against Confluence, loads each page body, splits text into overlapping chunks, embeds with `text-embedding-3-small`, and stores vectors (local JSON file by default, or **Pinecone**).
2. **Match** — When someone posts in Slack (by default: a **root** message in the monitored channel), the message text is embedded and compared to stored chunks (cosine similarity). The top **3** distinct pages are returned.
3. **Reply** — The app posts those links as a reply **in the same thread** as the ticket message.

## Setup

1. Copy `.env.example` to `.env` and fill in values (see inline comments).
2. **Confluence**: use an API token tied to your Atlassian account; set `CONFLUENCE_SOP_CQL` to match only SOP pages (labels, space, etc.). Optionally set **`CONFLUENCE_SOP_ROOT_PAGE_IDS`** to one or more numeric **folder** page IDs (from the page URL or page info) to index only that page and everything nested under it (all subfolders).
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

### Manual ticket match (no Slack)

Use the same embedding + vector index as production, without installing the Slack app:

1. Index SOPs once: `npm run index:sops`
2. Run a ticket through the matcher (multi-line is easiest with a pipe or heredoc):

   ```bash
   pbpaste | npm run match-ticket
   npm run match-ticket < ./ticket.txt
   npm run match-ticket <<'EOF'
   Urgency: high
   Team: CRM
   Summary: Example issue
   Description: Full details here
   EOF
   ```

   One line works too: `npm run match-ticket -- "short question here"`.

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

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run index:sops` | Full reindex from Confluence |
| `npm run match-ticket` | Match pasted/piped ticket text to SOPs (no Slack) |
| `npm run dev` | Run Slack app with `tsx watch` |
| `npm start` | Run compiled `dist/index.js` |
