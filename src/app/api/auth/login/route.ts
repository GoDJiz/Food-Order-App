import { NextRequest, NextResponse } from "next/server";
import { verifyPin } from "@/lib/auth/pin";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionSecret = process.env.SESSION_SECRET;
  const pinHash = process.env.DASHBOARD_PIN_HASH;

  if (!sessionSecret || !pinHash) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const pin = body.pin ?? "";
  const isValid = await verifyPin(pin, pinHash);

  if (!isValid) {
    // Generic message — don't reveal whether the PIN format or the PIN
    // itself was wrong.
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  const token = createSessionToken(sessionSecret);
  const res = NextResponse.json({ ok: true });

  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });

  return res;
}
