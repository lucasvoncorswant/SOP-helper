/**
 * Interprets structured tickets into **intention** (what action) and **object** (what thing)
 * to build stronger embedding queries and down-rank SOPs that only share keywords
 * without matching the requested action (e.g. PII logs vs updating a phone number).
 */

import { parseStructuredTicket } from "./ticketText.js";
import { keywordSimilarity, tokenizeForKeyword } from "./keyword.js";

export type TicketSemantics = {
  /** Single string for dense retrieval + hybrid keyword leg */
  embeddingQuery: string;
  keywordQuery: string;
  /** Detected action families present in the ticket (e.g. update, debug) */
  intentionFamilies: string[];
  /** Salient terms / phrases for the “thing” being acted on */
  objectTerms: string[];
  /** Whether intention/object heuristics apply (structured or rich parse) */
  useAlignment: boolean;
};

/** Action families: keyword hits in query or doc (English). */
const INTENTION_FAMILIES: Record<string, readonly string[]> = {
  update: [
    "update",
    "updating",
    "updated",
    "change",
    "changing",
    "changed",
    "modify",
    "modifying",
    "modified",
    "edit",
    "editing",
    "revise",
    "correct",
    "correction",
  ],
  debug: [
    "debug",
    "debugging",
    "troubleshoot",
    "troubleshooting",
    "trace",
    "tracing",
    "investigate",
    "investigating",
  ],
  logs: [
    "log",
    "logs",
    "logging",
    "pii",
    "audit",
    "monitoring",
  ],
  reset_access: [
    "reset",
    "password",
    "unlock",
    "credential",
    "credentials",
    "login",
    "signin",
    "sign-in",
    "authenticate",
  ],
  delete: ["delete", "deleting", "removed", "remove", "removing"],
  add: ["add", "adding", "create", "creating"],
  view: ["view", "viewing", "display", "read-only", "lookup"],
};

const OBJECT_PHRASES = [
  "phone number",
  "mobile number",
  "cell phone",
  "email address",
  "mailing address",
  "credit card",
  "account number",
  "lead",
  "client",
  "customer",
];

function hasWord(haystack: string, word: string): boolean {
  const re = new RegExp(
    `(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`,
    "i",
  );
  return re.test(haystack);
}

function detectFamilies(text: string): string[] {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const [family, words] of Object.entries(INTENTION_FAMILIES)) {
    for (const w of words) {
      if (hasWord(t, w)) {
        found.add(family);
        break;
      }
    }
  }
  return [...found];
}

function familyStrength(docLower: string, family: string): number {
  const words = INTENTION_FAMILIES[family];
  if (!words) return 0;
  let hits = 0;
  for (const w of words) {
    if (hasWord(docLower, w)) hits += 1;
  }
  return Math.min(1, hits / 3);
}

/**
 * Extract object-ish terms: known phrases + meaningful tokens from summary/description.
 */
function extractObjectTerms(summary: string, description: string): string[] {
  const blob = `${summary} ${description}`.toLowerCase();
  const terms = new Set<string>();

  for (const phrase of OBJECT_PHRASES) {
    if (blob.includes(phrase)) terms.add(phrase);
  }

  const cleaned = summary
    .replace(/\b(need to|should|must|to be|has to)\b/gi, " ")
    .replace(/[^\w\s]/g, " ");
  const tokens = tokenizeForKeyword(cleaned);
  for (const tok of tokens) {
    if (tok.length > 2) terms.add(tok);
  }
  const descTok = tokenizeForKeyword(description.slice(0, 800));
  for (const tok of descTok) {
    if (tok.length > 3) terms.add(tok);
  }

  return [...terms].slice(0, 24);
}

function buildEmbeddingQuery(parts: {
  team?: string;
  summary: string;
  description: string;
  intentions: string[];
  objects: string[];
}): string {
  const intentLine =
    parts.intentions.length > 0
      ? `Primary actions requested: ${parts.intentions.join(", ")}.`
      : "";
  const objLine =
    parts.objects.length > 0
      ? `Subject / records involved: ${parts.objects.join(", ")}.`
      : "";
  const teamLine = parts.team?.trim()
    ? `Team: ${parts.team.trim()}.`
    : "";

  return [
    "Support request (interpreted for procedure matching).",
    intentLine,
    objLine,
    teamLine,
    `Summary: ${parts.summary}`,
    parts.description.trim()
      ? `Details: ${parts.description.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build semantics for indexing/matching. Uses structured fields when present.
 */
export function extractTicketSemantics(raw: string): TicketSemantics {
  const parsed = parseStructuredTicket(raw);
  if (parsed) {
    const summary = parsed.summary.trim();
    const description = (parsed.description ?? "").trim();
    const team = parsed.team?.trim();
    const blob = `${summary}\n${description}`.toLowerCase();

    const intentions = detectFamilies(blob);
    const objects = extractObjectTerms(summary, description);

    const embeddingQuery = buildEmbeddingQuery({
      team,
      summary,
      description,
      intentions,
      objects,
    });

    const keywordQuery = [
      ...intentions,
      ...objects,
      summary,
      description.slice(0, 500),
      team ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      embeddingQuery,
      keywordQuery,
      intentionFamilies: intentions,
      objectTerms: objects,
      useAlignment: true,
    };
  }

  const plain = raw
    .replace(/<@[^>]+>/g, "")
    .replace(/<!subteam\^[^>]+>/g, "")
    .trim();
  const intentions = detectFamilies(plain);
  const objects = extractObjectTerms(plain, "");

  const hasRich =
    intentions.length > 0 ||
    objects.length > 0 ||
    plain.length > 40;

  if (!hasRich) {
    return {
      embeddingQuery: plain,
      keywordQuery: plain,
      intentionFamilies: [],
      objectTerms: [],
      useAlignment: false,
    };
  }

  const embeddingQuery = buildEmbeddingQuery({
    summary: plain.slice(0, 500),
    description: plain.slice(500, 2000),
    intentions,
    objects,
  });

  return {
    embeddingQuery,
    keywordQuery: [plain, ...intentions, ...objects].join("\n"),
    intentionFamilies: intentions,
    objectTerms: objects,
    useAlignment: intentions.length > 0 || objects.length > 0,
  };
}

/**
 * Scores how well a candidate SOP chunk matches ticket intention + object (0..1).
 * Down-ranks “wrong action” docs that only share nouns (e.g. phone + PII logs vs update phone).
 */
export function intentionObjectAlignment(
  sem: TicketSemantics,
  title: string,
  chunkBody: string,
): number {
  if (!sem.useAlignment) return 1;

  const doc = `${title}\n${chunkBody}`.toLowerCase();
  const titleLower = title.toLowerCase();

  let score = 0.55;

  // Object overlap (Dice via existing helper on concatenated terms)
  if (sem.objectTerms.length > 0) {
    const objBlob = sem.objectTerms.join(" ");
    const objSim = keywordSimilarity(objBlob, doc);
    score += 0.25 * objSim;
  } else {
    score += 0.15;
  }

  // Intention: compare query family vector to doc family strengths
  if (sem.intentionFamilies.length > 0) {
    const qVec: number[] = [];
    const dVec: number[] = [];
    for (const fam of sem.intentionFamilies) {
      qVec.push(1);
      const ds = Math.max(
        familyStrength(doc, fam),
        familyStrength(titleLower, fam) * 1.2,
      );
      dVec.push(Math.min(1, ds));
    }
    let dot = 0;
    let nq = 0;
    let nd = 0;
    for (let i = 0; i < qVec.length; i++) {
      dot += qVec[i] * dVec[i];
      nq += qVec[i] * qVec[i];
      nd += dVec[i] * dVec[i];
    }
    const intentionCos =
      nq > 0 && nd > 0 ? dot / (Math.sqrt(nq) * Math.sqrt(nd)) : 0;
    score += 0.35 * intentionCos;

    // Penalty: debug/log SOPs when the ticket wants data updates — only if object overlap is weak
    // (avoids crushing PII docs that still mention phones/customer data).
    if (sem.intentionFamilies.includes("update")) {
      const debugInTitle =
        familyStrength(titleLower, "debug") + familyStrength(titleLower, "logs");
      const updateInTitle =
        familyStrength(titleLower, "update") +
        familyStrength(titleLower, "reset_access") * 0.3;
      const objBlob = sem.objectTerms.join(" ");
      const objHit = objBlob ? keywordSimilarity(objBlob, doc) : 0;
      if (debugInTitle > 0.35 && updateInTitle < 0.15 && objHit < 0.1) {
        score *= 0.58;
      }
    }
    if (sem.intentionFamilies.includes("debug") || sem.intentionFamilies.includes("logs")) {
      const updInTitle = familyStrength(titleLower, "update");
      if (updInTitle > 0.4 && familyStrength(titleLower, "debug") < 0.1) {
        score *= 0.7;
      }
    }
  } else {
    score += 0.2;
  }

  // Strong penalty: password/login SOPs when the ticket is about updating CRM/contact fields, not access resets
  if (
    sem.intentionFamilies.includes("update") &&
    sem.objectTerms.some(
      (o) =>
        o.includes("phone") ||
        o.includes("number") ||
        o === "customer" ||
        o === "client" ||
        o === "lead",
    ) &&
    !sem.intentionFamilies.includes("reset_access")
  ) {
    const resetHeavy =
      familyStrength(titleLower, "reset_access") +
      familyStrength(doc, "reset_access") * 0.25;
    const updateInTitle = familyStrength(titleLower, "update");
    if (resetHeavy > 0.4 && updateInTitle < 0.22) {
      score *= 0.34;
    }
  }

  // Boost when title and body clearly match “update” + phone/number (production CRM-style SOPs)
  if (
    sem.intentionFamilies.includes("update") &&
    sem.objectTerms.some((o) => o.includes("phone") || o.includes("number"))
  ) {
    const updSignal =
      familyStrength(titleLower, "update") * 1.1 + familyStrength(doc, "update") * 0.35;
    const phoneSignal = hasWord(doc, "phone") || hasWord(doc, "number");
    if (updSignal > 0.25 && phoneSignal) {
      score = Math.min(1, score * 1.12);
    }
  }

  return Math.max(0.12, Math.min(1, score));
}
