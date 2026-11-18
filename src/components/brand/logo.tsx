import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { DARGLOBAL_LOGO_PATHS, DARGLOBAL_LOGO_VIEWBOX } from "./darglobal-logo-paths";

/**
 * The DarGlobal wordmark, inlined so it inherits `currentColor` and needs no
 * image request (the CSP allows none from other origins). The artwork is
 * DarGlobal's trademark, used here because this assistant was built for
 * DarGlobal's own technical assessment.
 */
export function DarGlobalLogo({ className }: { className?: string }) {
  return (
    <svg viewBox={DARGLOBAL_LOGO_VIEWBOX} role="img" aria-label="DarGlobal" fill="currentColor" className={className}>
      {DARGLOBAL_LOGO_PATHS.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

/** Header lockup: the wordmark, a hairline, and what this product is. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <DarGlobalLogo className="h-9 w-auto text-ink-950" />
      <span aria-hidden className="h-5 w-px bg-ink-200" />
      <span className="text-[13px] font-medium tracking-tight text-ink-500">{SITE.name}</span>
    </div>
  );
}
