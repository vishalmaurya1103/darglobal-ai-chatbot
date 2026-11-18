import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names and resolves Tailwind conflicts, so a component's default
 * classes can be overridden by a caller's `className` without specificity games.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Returns `url` only if it is an ordinary web link.
 *
 * Source URLs originate from scraped third-party pages, so they are untrusted
 * input that ends up in an `href`. Anything that is not http(s) - `javascript:`
 * above all - is dropped rather than rendered as a clickable link.
 */
export function safeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
