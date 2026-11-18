/**
 * Loads the local embedding and reranker models in the background at server start,
 * so the first question does not pay the model download and initialisation cost.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ embedQuery }, { scorePassages }] = await Promise.all([
    import("./lib/ai/embeddings"),
    import("./lib/ai/reranker"),
  ]);

  const startedAt = Date.now();
  Promise.all([embedQuery("warm up"), scorePassages("warm up", ["warm up"])])
    .then(() => console.info(`AI models ready in ${Date.now() - startedAt} ms`))
    .catch((error) => console.error("Model warm-up failed", error));
}
