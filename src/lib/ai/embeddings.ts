import { config } from "../config";
import { getOpenRouterClient } from "./openrouter";

/**
 * Embeddings come from BAAI bge-m3 through OpenRouter: multilingual (English and
 * Arabic, which Wasalt mixes) with 1024 dimensions. Calling an API rather than
 * running a model in-process keeps the server small enough for low-memory hosting.
 * Must match the `vector(1024)` column in db/schema.sql.
 */
export const EMBEDDING_DIMENSIONS = 1024;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await getOpenRouterClient().embeddings.create({
    model: config.embeddingModel,
    input: texts,
    encoding_format: "float",
  });

  const vectors = [...response.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(`Unexpected embedding response from ${config.embeddingModel}`);
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
