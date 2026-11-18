import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names and resolves Tailwind conflicts, so a component's default
 * classes can be overridden by a caller's `className` without specificity games.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
