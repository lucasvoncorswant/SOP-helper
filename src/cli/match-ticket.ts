/**
 * Mock a Slack ticket in the terminal: same matching pipeline as the bot (no Slack tokens).
 * Loads `.env` via config; needs embeddings + `.data/sop-vectors.json` (run `npm run index:sops` first).
 */
import "dotenv/config";
import { findTopSopsForTicketText } from "../match.js";
import { config } from "../config.js";
import { normalizeTicketTextForEmbedding } from "../ticketText.js";

function formatSimilarity(score: number): string {
  if (score >= 0 && score <= 1) {
    return (score * 100).toFixed(1);
  }
  return (((score + 1) / 2) * 100).toFixed(1);
}

async function readStdinIfPiped(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const fromArg = process.argv.slice(2).join(" ").trim();
  const fromStdin = (await readStdinIfPiped()).trim();
  const text = fromArg || fromStdin;

  if (!text) {
    console.error("Usage (mock Slack input, print SOP suggestions):");
    console.error('  npm run suggest -- "paste ticket text here"');
    console.error("  npm run suggest < ticket.txt");
    console.error("  pbpaste | npm run suggest");
    process.exit(1);
  }

  const normalized = normalizeTicketTextForEmbedding(text);
  console.log("--- Mock Slack message (console) ---\n");
  if (process.env.DEBUG_TICKET_TEXT === "1") {
    console.log("Text used for embedding (after normalization):\n");
    console.log(normalized || "(empty)\n");
    console.log("---\n");
  }

  const matches = await findTopSopsForTicketText(text);
  const k = config.topK();

  console.log(`Suggested SOPs (top ${k}, same as Slack bot):\n`);
  if (matches.length === 0) {
    console.log(
      "No matches — empty text after normalization, or index missing/empty. Run `npm run index:sops` first.",
    );
    console.log("\n--- done ---");
    return;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const sim = formatSimilarity(m.score);
    console.log(`${i + 1}. ${m.title}`);
    console.log(`   Similarity: ~${sim}%`);
    console.log(`   ${m.url}`);
    console.log("");
  }
  console.log("--- done ---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
