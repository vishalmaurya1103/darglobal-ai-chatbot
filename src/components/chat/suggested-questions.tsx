const SUGGESTIONS = [
  { source: "DarGlobal", question: "Which DarGlobal projects are in Dubai and when do they complete?" },
  { source: "DarGlobal", question: "What amenities does Trump Tower Jeddah offer?" },
  { source: "DarGlobal", question: "What did DarGlobal report about revenue growth in 2026?" },
  { source: "Wasalt", question: "Cheapest villa for sale in Riyadh" },
  { source: "Wasalt", question: "3 bedroom apartments for sale in Jeddah under 1M" },
  { source: "Analytics", question: "How many DarGlobal projects are in Oman?" },
];

export function SuggestedQuestions({ onSelect }: { onSelect: (question: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SUGGESTIONS.map(({ source, question }) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-amber-400"
        >
          <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">{source}</span>
          <span className="text-sm text-stone-700">{question}</span>
        </button>
      ))}
    </div>
  );
}
