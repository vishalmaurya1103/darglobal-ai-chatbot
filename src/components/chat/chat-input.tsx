"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  isStreaming: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const MAX_LENGTH = 1_000;
/** Show the counter only once the user is close enough for it to matter. */
const COUNTER_THRESHOLD = 0.8;

export function ChatInput({ isStreaming, onSubmit, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a ceiling, then scroll inside the box.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [value]);

  const submit = () => {
    const question = value.trim();
    if (!question || isStreaming) return;
    onSubmit(question);
    setValue("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  // Enter sends; Shift+Enter inserts a newline. IME composition must not submit.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const canSend = value.trim().length > 0 && !isStreaming;
  const showCounter = value.length > MAX_LENGTH * COUNTER_THRESHOLD;

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={cn(
          "group relative flex items-end gap-2 rounded-3xl border border-ink-200/80 bg-white/90 p-2 pl-4",
          "shadow-[0_2px_8px_-2px_rgba(23,19,15,0.08),0_12px_32px_-12px_rgba(23,19,15,0.18)] backdrop-blur-xl",
          "transition-colors focus-within:border-gold-400",
        )}
      >
        <label htmlFor="question" className="sr-only">
          Ask a question about DarGlobal or Wasalt properties
        </label>
        <textarea
          id="question"
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={MAX_LENGTH}
          enterKeyHint="send"
          placeholder="Ask about a project, a listing, prices or amenities…"
          className={cn(
            "scrollbar-subtle max-h-[180px] flex-1 resize-none self-center bg-transparent py-2.5 text-[15px]",
            "text-ink-900 outline-none placeholder:text-ink-400",
          )}
        />

        <div className="flex items-center gap-2 pb-0.5">
          {showCounter && (
            <span className="text-[11px] tabular-nums text-ink-400" aria-hidden>
              {MAX_LENGTH - value.length}
            </span>
          )}

          {isStreaming ? (
            <motion.button
              type="button"
              onClick={onStop}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.94 }}
              aria-label="Stop generating"
              className="grid size-10 place-items-center rounded-2xl bg-ink-900 text-white transition-colors hover:bg-ink-700"
            >
              <Square className="size-3.5 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              type="submit"
              disabled={!canSend}
              whileTap={canSend ? { scale: 0.94 } : undefined}
              aria-label="Send question"
              className={cn(
                "grid size-10 place-items-center rounded-2xl transition-all duration-200",
                canSend
                  ? "bg-gradient-to-br from-gold-500 to-gold-700 text-white shadow-md shadow-gold-700/25 hover:brightness-110"
                  : "cursor-not-allowed bg-ink-100 text-ink-300",
              )}
            >
              <ArrowUp className="size-5" strokeWidth={2.5} />
            </motion.button>
          )}
        </div>
      </div>

      <p className="mt-2.5 text-center text-[11px] text-ink-400">
        Answers come only from scraped public pages and always cite their source. Verify details with the listing.
      </p>
    </form>
  );
}
