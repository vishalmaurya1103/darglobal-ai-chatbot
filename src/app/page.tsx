import { connection } from "next/server";
import { Chat } from "@/components/chat/chat";

/**
 * The route blocks on the incoming request rather than being prerendered.
 *
 * A CSP nonce is minted per request in `proxy.ts`, and Next.js can only stamp it
 * onto the page's scripts while rendering that request - a build-time prerender
 * has no nonce to use. `instant = false` tells Cache Components that this
 * segment is allowed to block, which is the documented trade for nonce support.
 *
 * The cost is nil in practice: the shell is a client component with no server
 * data to fetch, so there is nothing to wait on beyond the request itself.
 */
export const instant = false;

export default async function HomePage() {
  await connection();
  return <Chat />;
}
