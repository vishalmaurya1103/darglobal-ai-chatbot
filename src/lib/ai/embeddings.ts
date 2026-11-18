import "./model-cache";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * multilingual-e5-small: 384 dimensions, 512-token input, runs on CPU.
 * Multilingual because Wasalt content mixes English and Arabic.
 */
const MODEL_ID = "Xenova/multilingual-e5-small";

export const EMBEDDING_DIMENSIONS = 384;

// Kept on globalThis so the startup warm-up and the route handlers share one loaded model.
const globalForModels = globalThis as typeof globalThis & { embeddingModel?: Promise<FeatureExtractionPipeline> };

function getExtractor(): Promise<FeatureExtractionPipeline> {
  globalForModels.embeddingModel ??= pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
  }) as Promise<FeatureExtractionPipeline>;
  return globalForModels.embeddingModel;
}

async function embed(texts: string[]): Promise<number[][]> {
  const model = await getExtractor();
  const output = await model(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

// E5 models are trained with "query:" / "passage:" prefixes; omitting them hurts retrieval quality.
export function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts.map((text) => `passage: ${text}`));
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([`query: ${text}`]);
  return vector;
}
