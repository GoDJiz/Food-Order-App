import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the X-Line-Signature header against the raw request body using
 * the channel secret. Must be called with the RAW (unparsed) body string —
 * parsing/re-serializing JSON before this check can change byte content
 * and cause valid signatures to fail.
 */
export function verifyLineSignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
