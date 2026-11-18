import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | undefined;

/** OpenRouter exposes an OpenAI-compatible API for both chat completions and embeddings. */
export function getOpenRouterClient(): OpenAI {
  client ??= new OpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": config.appUrl, "X-Title": "DarGlobal Property Assistant" },
    timeout: 30_000,
    maxRetries: 2,
  });
  return client;
}
