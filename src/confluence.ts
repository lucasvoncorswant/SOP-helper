import { config } from "./config.js";

/**
 * Combines the configured CQL with an optional subtree scope: Confluence “folders” are
 * pages; limiting to a folder means matching that page id plus any descendant via `ancestor`.
 * Each root uses `(ancestor = id or id = id)` so the folder page itself is included.
 */
export function buildSopSearchCql(): string {
  const base = config.confluenceSopCql().trim();
  const roots = config.confluenceSopRootPageIds();
  if (roots.length === 0) return base;

  const scope =
    roots.length === 1
      ? `(ancestor = ${roots[0]} or id = ${roots[0]})`
      : `(${roots
          .map((id) => `(ancestor = ${id} or id = ${id})`)
          .join(" or ")})`;
  if (!base) return `type = page and ${scope}`;
  return `(${base}) and ${scope}`;
}

export type ConfluencePage = {
  id: string;
  title: string;
  bodyText: string;
  webUrl: string;
};

type ContentListResponse = {
  results: Array<{
    id: string;
    title: string;
    _links: { webui?: string };
  }>;
  _links?: { next?: string };
};

function baseWikiUrl(): string {
  const base = config.confluenceBaseUrl().replace(/\/$/, "");
  return base.endsWith("/wiki") ? base : `${base}/wiki`;
}

function authHeader(): string {
  const email = config.confluenceEmail();
  const token = config.confluenceApiToken();
  const b64 = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${b64}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confluence API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageBody(pageId: string): Promise<string> {
  const wiki = baseWikiUrl();
  const url = `${wiki}/rest/api/content/${pageId}?expand=body.storage`;
  const data = await fetchJson<{ body?: { storage?: { value?: string } } }>(
    url,
  );
  const html = data.body?.storage?.value ?? "";
  return htmlToPlain(html);
}

/**
 * Paginates Confluence search (v1) using CQL.
 */
export async function fetchSopPages(): Promise<ConfluencePage[]> {
  const wiki = baseWikiUrl();
  const cql = buildSopSearchCql();
  const limit = 50;
  const pages: ConfluencePage[] = [];
  let start = 0;

  for (;;) {
    const params = new URLSearchParams({
      cql,
      limit: String(limit),
      start: String(start),
    });
    const url = `${wiki}/rest/api/content/search?${params.toString()}`;
    const data = await fetchJson<ContentListResponse>(url);
    for (const r of data.results) {
      const bodyText = await fetchPageBody(r.id);
      const path = r._links.webui ?? `/pages/${r.id}`;
      const webUrl = `${wiki}${path.startsWith("/") ? path : `/${path}`}`;
      pages.push({
        id: r.id,
        title: r.title,
        bodyText,
        webUrl,
      });
    }
    if (data.results.length < limit) break;
    start += limit;
  }

  return pages;
}
