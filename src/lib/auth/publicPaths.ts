// Paths that must remain reachable without a session:
// - /login and its API (so you can actually log in)
// - /api/line/webhook (LINE calls this directly; protected by signature, not PIN)
// - Next.js internals and static assets
const PUBLIC_PATHS = [/^\/login$/, /^\/api\/auth\/login$/, /^\/api\/line\/webhook$/];

const PUBLIC_PREFIXES = ["/_next/", "/favicon.ico", "/public/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}
