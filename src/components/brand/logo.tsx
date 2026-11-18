import { cn } from "@/lib/utils";

/**
 * Brand mark for the assistant.
 *
 * This is a purpose-built mark for the property assistant, not either company's
 * registered logo: shipping a third party's trademark would imply this demo is
 * an official product. To use the official artwork, drop an SVG into
 * `public/brand/` and swap <Logomark /> for an <img>.
 *
 * The glyph is a three-tower skyline - the shared subject of both data sources -
 * drawn once here and reused at every size.
 */

export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="Property Assistant"
      className={cn("size-10", className)}
    >
      <defs>
        <linearGradient id="brand-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.28 0.02 70)" />
          <stop offset="100%" stopColor="oklch(0.14 0.015 65)" />
        </linearGradient>
        <linearGradient id="brand-glyph" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.72 0.13 77)" />
          <stop offset="100%" stopColor="oklch(0.9 0.06 85)" />
        </linearGradient>
      </defs>

      <rect width="40" height="40" rx="11" fill="url(#brand-tile)" />
      <rect
        x="0.6"
        y="0.6"
        width="38.8"
        height="38.8"
        rx="10.4"
        fill="none"
        stroke="url(#brand-glyph)"
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />

      {/* Skyline: three towers, the tallest chamfered like a roofline. */}
      <g fill="url(#brand-glyph)">
        <rect x="9" y="22" width="4.2" height="10" rx="1.4" />
        <path d="M16.9 15.4 19 13l2.1 2.4V30.6a1.4 1.4 0 0 1-1.4 1.4h-1.4a1.4 1.4 0 0 1-1.4-1.4Z" />
        <rect x="24.8" y="18.5" width="4.2" height="13.5" rx="1.4" />
      </g>
      {/* Baseline, grounding the towers. */}
      <rect x="8" y="33.2" width="21" height="1.6" rx="0.8" fill="url(#brand-glyph)" fillOpacity="0.5" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="font-display text-[15px] font-semibold tracking-tight text-ink-900">
        Property Assistant
      </span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
        DarGlobal × Wasalt
      </span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Logomark className="size-10 shrink-0" />
      <Wordmark />
    </div>
  );
}
