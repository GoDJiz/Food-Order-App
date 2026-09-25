import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

const SECRET = "test-session-secret";

test("a freshly created token verifies successfully", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const token = createSessionToken(SECRET, now);
  assert.equal(verifySessionToken(token, SECRET, now), true);
});

test("a token verifies within its TTL window", () => {
  const issuedAt = new Date("2026-09-17T10:00:00Z");
  const token = createSessionToken(SECRET, issuedAt);
  const laterButStillValid = new Date("2026-09-17T20:00:00Z"); // +10h, within 12h TTL
  assert.equal(verifySessionToken(token, SECRET, laterButStillValid), true);
});

test("an expired token is rejected", () => {
  const issuedAt = new Date("2026-09-17T10:00:00Z");
  const token = createSessionToken(SECRET, issuedAt);
  const afterExpiry = new Date("2026-09-17T23:00:00Z"); // +13h, past 12h TTL
  assert.equal(verifySessionToken(token, SECRET, afterExpiry), false);
});

test("a token signed with a different secret is rejected", () => {
  const token = createSessionToken(SECRET);
  assert.equal(verifySessionToken(token, "wrong-secret"), false);
});

test("a tampered token payload is rejected", () => {
  const token = createSessionToken(SECRET);
  const [payload, signature] = token.split(".");
  const tampered = payload.slice(0, -1) + "X" + "." + signature;
  assert.equal(verifySessionToken(tampered, SECRET), false);
});

test("missing, empty, or malformed tokens are rejected", () => {
  assert.equal(verifySessionToken(undefined, SECRET), false);
  assert.equal(verifySessionToken(null, SECRET), false);
  assert.equal(verifySessionToken("", SECRET), false);
  assert.equal(verifySessionToken("not-a-valid-token", SECRET), false);
  assert.equal(verifySessionToken("only.one.part.too.many", SECRET), false);
});
