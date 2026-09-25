import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "dashboard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export { SESSION_COOKIE_NAME };

interface SessionPayload {
  iat: number; // issued-at, unix seconds
  exp: number; // expiry, unix seconds
}

/**
 * Creates a signed session token: base64url(payload).base64url(hmac).
 * Stateless — no session table/row to look up or clean up, which keeps
 * this in line with the "no roles, no extra tables" scope for Phase 4.
 */
export function createSessionToken(secret: string, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = { iat, exp: iat + SESSION_TTL_SECONDS };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a session token's signature and expiry. Returns true only if
 * both the signature is valid (constant-time compare) and the token has
 * not expired.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: Date = new Date()
): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payloadB64, signature] = parts;
  const expectedSignature = sign(payloadB64, secret);

  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return false;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return false;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (typeof payload.exp !== "number" || nowSeconds >= payload.exp) return false;

  return true;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export const SESSION_TTL = SESSION_TTL_SECONDS;
