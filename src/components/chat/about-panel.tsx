import { KnowledgeBaseStatus } from "./knowledge-base-status";

const PIPELINE = [
  ["Scrape", "Public DarGlobal projects, press, insights and blog pages, plus a sample of Wasalt sale and rent listings."],
  ["Embed", "Each record is chunked and embedded with multilingual-e5-small (English and Arabic)."],
  ["Retrieve", "Hybrid search in Neon Postgres: vector + BM25, fused with RRF and filtered by price, bedrooms and location."],
  ["Rerank", "A cross-encoder re-orders the candidates so only the most relevant passages reach the model."],
  ["Answer", "A free OpenRouter model writes a grounded answer that cites every source."],
];

/** Explains what the assistant knows and how it works, for reviewers trying it for the first time. */
export function AboutPanel() {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">What this assistant knows</h3>
        <KnowledgeBaseStatus />
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-5">
        {PIPELINE.map(([step, description], index) => (
          <li key={step} className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              {index + 1}. {step}
            </p>
            <p className="text-xs leading-relaxed text-stone-600">{description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
