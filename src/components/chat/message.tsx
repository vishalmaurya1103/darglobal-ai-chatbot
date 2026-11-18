import type { ConversationMessage } from "@/hooks/use-chat";
import { RichText } from "./rich-text";
import { SourceCard } from "./source-card";

export function Message({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-stone-900 px-4 py-2.5 text-sm text-white">
          {message.content}
        </p>
      </div>
    );
  }

  const sources = message.sources ?? [];
  const isThinking = message.status === "streaming" && !message.content;

  // Once the answer is complete, show only the sources it cites, keeping their citation numbers.
  const cited = new Set([...message.content.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
  const visibleSources = sources
    .map((source, index) => ({ source, number: index + 1 }))
    .filter(({ number }) => message.status !== "done" || cited.size === 0 || cited.has(number));

  return (
    <div className="space-y-3">
      <div
        className={`text-sm leading-relaxed ${message.status === "error" ? "text-red-700" : "text-stone-800"}`}
        aria-live="polite"
      >
        {isThinking ? (
          <span className="inline-flex items-center gap-2 text-stone-500">
            <span className="size-2 animate-pulse rounded-full bg-amber-500" />
            Searching listings…
          </span>
        ) : (
          <RichText text={message.content} sourceCount={sources.length} />
        )}
      </div>

      {message.model && (
        <p className="text-[11px] text-stone-400">
          Answered by {message.model} via OpenRouter · {visibleSources.length} source
          {visibleSources.length === 1 ? "" : "s"}
        </p>
      )}

      {visibleSources.length > 0 && (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {visibleSources.map(({ source, number }) => (
            <SourceCard key={source.id} source={source} index={number} />
          ))}
        </div>
      )}
    </div>
  );
}
