"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  isStreaming: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const MAX_LENGTH = 1_000;
const MAX_HEIGHT_PX = 180;
/** Show the counter only once the user is close enough for it to matter. */
const COUNTER_THRESHOLD = 0.8;

const actionButton = "grid size-9 place-items-center rounded-full transition-colors duration-200";
const swap = { initial: { scale: 0.7, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.7, opacity: 0 } };

export function ChatInput({ isStreaming, onSubmit, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a ceiling, then scroll inside the box.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !isStreaming;
  const showCounter = value.length > MAX_LENGTH * COUNTER_THRESHOLD;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim());
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

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={cn(
          "flex items-end gap-2 rounded-[1.75rem] border border-ink-200 bg-white p-2 pl-5",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.16)]",
          "transition-[border-color,box-shadow] duration-200 focus-within:border-ink-400",
          "focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-16px_rgba(0,0,0,0.24)]",
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
          placeholder="Ask about projects, listings or prices…"
          className="scrollbar-subtle flex-1 resize-none self-center bg-transparent py-2 text-[15px] text-ink-950 outline-none placeholder:text-ink-400"
        />

        {showCounter && (
          <span className="self-center text-[11px] tabular-nums text-ink-400" aria-hidden>
            {MAX_LENGTH - value.length}
          </span>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {isStreaming ? (
            <motion.button
              key="stop"
              type="button"
              onClick={onStop}
              {...swap}
              whileTap={{ scale: 0.92 }}
              aria-label="Stop generating"
              className={cn(actionButton, "bg-ink-950 text-white hover:bg-ink-700")}
            >
              <Square className="size-3 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              type="submit"
              disabled={!canSend}
              {...swap}
              whileTap={canSend ? { scale: 0.92 } : undefined}
              aria-label="Send question"
              className={cn(
                actionButton,
                canSend ? "bg-ink-950 text-white hover:bg-ink-700" : "cursor-not-allowed bg-ink-100 text-ink-400",
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-2.5 text-center text-[11px] text-ink-400">
        Answers come only from scraped public pages and always cite their source. Verify details with the listing.
      </p>
    </form>
  );
}
