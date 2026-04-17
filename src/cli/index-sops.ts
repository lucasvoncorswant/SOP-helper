import { indexAllSopsFromConfluence } from "../indexSops.js";

async function main(): Promise<void> {
  console.log("Fetching Confluence pages and building embeddings…");
  const { pageCount, chunkCount } = await indexAllSopsFromConfluence();
  console.log(`Done. Indexed ${pageCount} pages, ${chunkCount} chunks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
