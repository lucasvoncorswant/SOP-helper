/**
 * Normalizes Slack support-ticket text for embedding.
 * Structured tickets (e.g. "Request Tech Support" with Summary / Description fields)
 * are reduced to the fields that carry semantic signal, so boilerplate does not
 * dilute the vector match.
 */

function stripSlackMentions(text: string): string {
  return text.replace(/<@[^>]+>/g, "").replace(/<!subteam\^[^>]+>/g, "").trim();
}

/**
 * If the message looks like a structured ticket, returns a compact string for embedding.
 * Otherwise returns the trimmed message (with mentions stripped).
 */
export function normalizeTicketTextForEmbedding(raw: string): string {
  const text = stripSlackMentions(raw);
  if (!text) return "";

  const looksStructured =
    /request\s+tech\s+support/i.test(text) ||
    (/^\s*Urgency:\s/im.test(text) &&
      /^\s*Summary:\s/im.test(text) &&
      /^\s*Description:\s/im.test(text));

  if (!looksStructured) return text;

  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const takeField = (name: string): string | undefined => {
    const re = new RegExp(`^${name}:\\s*(.*)$`, "i");
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m[1]?.trim() ?? "";
    }
    return undefined;
  };

  const urgency = takeField("Urgency");
  const team = takeField("Team");
  const summary = takeField("Summary");

  let description = "";
  const descLineIdx = lines.findIndex((l) => /^Description:\s*/i.test(l));
  if (descLineIdx !== -1) {
    description = lines[descLineIdx].replace(/^Description:\s*/i, "").trim();
    for (let j = descLineIdx + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^(Reporter|Timestamp|Urgency|Team|Summary):\s*/i.test(line)) break;
      if (line === "") continue;
      description += (description ? " " : "") + line.trim();
    }
  }

  const parts: string[] = [];
  if (urgency) parts.push(`Urgency: ${urgency}`);
  if (team) parts.push(`Team: ${team}`);
  if (summary) parts.push(`Summary: ${summary}`);
  if (description) parts.push(`Description: ${description}`);

  if (parts.length >= 2) return parts.join("\n");
  return text;
}
