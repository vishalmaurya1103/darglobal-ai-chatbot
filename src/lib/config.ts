// Ordered by measured time to first token on grounded answers.
const DEFAULT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "baidu/ernie-5.5-flash-preview:free",
  "nvidia/nemotron-3.5-lightning:free",
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Environment access is lazy so `next build` does not need runtime secrets. */
export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get openRouterApiKey() {
    return required("OPENROUTER_API_KEY");
  },
  /** Models are tried in order; later entries are fallbacks for rate limits and outages. */
  get openRouterModels() {
    const configured = process.env.OPENROUTER_MODELS?.split(",").map((model) => model.trim());
    return configured?.filter(Boolean).length ? configured.filter(Boolean) : DEFAULT_MODELS;
  },
  get embeddingModel() {
    return process.env.EMBEDDING_MODEL ?? "baai/bge-m3";
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
};
