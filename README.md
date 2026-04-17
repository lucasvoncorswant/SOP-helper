# SOP Helper

Service that indexes Standard Operating Procedures from **Confluence** with **OpenAI** embeddings, then listens on **Slack** for new support messages and replies in the thread with the top matching SOP links (semantic search).

## How it works

1. **Index** — `npm run index:sops` runs a CQL search against Confluence, loads each page body, splits text into overlapping chunks, embeds with `text-embedding-3-small`, and stores vectors (local JSON file by default, or **Pinecone**).
2. **Match** — When someone posts in Slack (by default: a **root** message in the monitored channel), the message text is embedded and compared to stored chunks (cosine similarity). The top **3** distinct pages are returned.
3. **Reply** — The app posts those links as a reply **in the same thread** as the ticket message.

## Setup

1. Copy `.env.example` to `.env` and fill in values (see inline comments).
2. **Confluence**: use an API token tied to your Atlassian account; set `CONFLUENCE_SOP_CQL` to match only SOP pages (labels, space, etc.).
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

## Configuration notes

- **`SLACK_SUPPORT_CHANNEL_ID`**: If set, only messages in that channel trigger matching. If omitted, any channel the bot is in will trigger (use with care). Channel IDs appear in Slack URLs (`…/archives/C0AT8QGTV8X` → `C0AT8QGTV8X`).
- **`SLACK_PROCESS_THREAD_REPLIES`**: Default `false` so only **top-level** messages are treated as new tickets. Set `true` to also match replies inside threads.
- **Structured tickets**: Messages that look like “Request Tech Support” with `Urgency` / `Team` / `Summary` / `Description` are normalized before embedding so boilerplate does not dominate the match (the model sees mainly those fields).
- **Workflow / bot posts**: If tickets are posted by Slack Workflow as `bot_message`, set **`SLACK_ALLOW_BOT_TICKETS=true`** and **`SLACK_APP_ID`** to your Slack app’s ID so the service does not reply to its own posts.
- **`VECTOR_BACKEND=local`**: Stores vectors in `LOCAL_VECTOR_PATH` (default `.data/sop-vectors.json`). Fine for moderate corpora; use **Pinecone** for large-scale or multi-instance deployments. Pinecone indexes must use **1536** dimensions for `text-embedding-3-small`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run index:sops` | Full reindex from Confluence |
| `npm run dev` | Run Slack app with `tsx watch` |
| `npm start` | Run compiled `dist/index.js` |
