/**
 * Manual ticket → SOP match (same pipeline as Slack), no Slack tokens required.
 * Needs OPENAI_* and vector settings (e.g. LOCAL_VECTOR_PATH); run `npm run index:sops` first.
 */
import { findTopSopsForTicketText } from "../match.js";

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
    console.error("Usage:");
    console.error('  npm run match-ticket -- "paste or type ticket text here"');
    console.error("  npm run match-ticket < ticket.txt");
    console.error("  pbpaste | npm run match-ticket");
    process.exit(1);
  }

  const matches = await findTopSopsForTicketText(text);
  if (matches.length === 0) {
    console.log(
      "No matches (empty text after normalization, or index empty). Try `npm run index:sops` first.",
    );
    return;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const sim = formatSimilarity(m.score);
    console.log(`${i + 1}. ${m.title}`);
    console.log(`   ~${sim}% similarity`);
    console.log(`   ${m.url}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
