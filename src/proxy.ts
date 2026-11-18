import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for every document request.
 *
 * `proxy.ts` replaces the deprecated `middleware.ts` convention in Next.js 16.
 * It runs before rendering and, per the Next.js guidance, holds no shared state -
 * the rate limiter lives in the route handler, where the Node runtime is guaranteed.
 *
 * A fresh nonce is minted per request and placed on the CSP header; Next.js reads
 * it back out and stamps it onto its own framework and page scripts.
 */

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // `strict-dynamic` lets the nonce'd Next.js bootstrap load its own chunks,
    // and makes host allow-lists redundant. React needs eval only in development.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind and motion set styles through the CSSOM and inline attributes.
    // Styles cannot exfiltrate data the way scripts can, so this is the accepted trade-off.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // next/font self-hosts its files, so no external font origin is needed.
    "font-src 'self'",
    // The browser only ever talks to this app; the OpenRouter call is server-side.
    `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const SECURITY_HEADERS: Record<string, string> = {
  // Superseded by frame-ancestors, kept for browsers that predate it.
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "interest-cohort=()",
    "browsing-topics=()",
  ].join(", "),
};

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // Only meaningful over TLS; harmless locally, and correct the moment it is deployed.
  if (!isDev) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return response;
}

export const config = {
  matcher: [
    {
      // API routes set their own headers; static assets need none.
      source: "/((?!api|_next/static|_next/image|favicon.ico|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
