import { embedQuery } from "../src/lib/ai/embeddings";
import { scorePassages } from "../src/lib/ai/reranker";

/** Downloads and caches both local models, so the Docker image starts without network fetches. */
async function main() {
  await embedQuery("warm up");
  await scorePassages("warm up", ["warm up"]);
  console.log("Embedding and reranker models cached");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
