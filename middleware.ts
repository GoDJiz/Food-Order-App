import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isPublicPath } from "@/lib/auth/publicPaths";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValidSession = !!sessionSecret && verifySessionToken(token, sessionSecret);

  if (isValidSession) {
    return NextResponse.next();
  }

  // Dashboard APIs get a 401 JSON response; dashboard pages get redirected
  // to /login. Both behave identically on mobile and desktop since this is
  // a standard server response, not client-side JS.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

// Apply to everything except Next.js static asset internals (handled above
// too, but this keeps the matcher itself narrow and cheap).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
