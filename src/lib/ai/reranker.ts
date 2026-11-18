import "./model-cache";
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

/**
 * Cross-encoder trained on MS MARCO. Unlike the bi-encoder used for retrieval,
 * it reads the query and passage together, which makes it far more precise
 * at ordering a short candidate list.
 */
const MODEL_ID = "Xenova/ms-marco-MiniLM-L-6-v2";

interface CrossEncoder {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

// Kept on globalThis so the startup warm-up and the route handlers share one loaded model.
const globalForModels = globalThis as typeof globalThis & { rerankerModel?: Promise<CrossEncoder> };

function getCrossEncoder(): Promise<CrossEncoder> {
  globalForModels.rerankerModel ??= Promise.all([
    AutoTokenizer.from_pretrained(MODEL_ID),
    AutoModelForSequenceClassification.from_pretrained(MODEL_ID, { dtype: "q8" }),
  ]).then(([tokenizer, model]) => ({ tokenizer, model }));
  return globalForModels.rerankerModel;
}

/** Returns one relevance score (logit) per passage; higher is more relevant. */
export async function scorePassages(query: string, passages: string[]): Promise<number[]> {
  if (passages.length === 0) return [];
  const { tokenizer, model } = await getCrossEncoder();

  const inputs = tokenizer(new Array<string>(passages.length).fill(query), {
    text_pair: passages,
    padding: true,
    truncation: true,
  });
  const { logits } = await model(inputs);
  return (logits.tolist() as number[][]).map(([score]) => score);
}
