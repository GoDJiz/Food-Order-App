import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath } from "@/lib/auth/publicPaths";

test("login page and login API are public", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/api/auth/login"), true);
});

test("LINE webhook is public (protected by signature, not PIN)", () => {
  assert.equal(isPublicPath("/api/line/webhook"), true);
});

test("static asset prefixes are public", () => {
  assert.equal(isPublicPath("/_next/static/chunk.js"), true);
  assert.equal(isPublicPath("/favicon.ico"), true);
});

test("dashboard pages are NOT public", () => {
  assert.equal(isPublicPath("/today"), false);
  assert.equal(isPublicPath("/orders"), false);
  assert.equal(isPublicPath("/products"), false);
  assert.equal(isPublicPath("/reports"), false);
  assert.equal(isPublicPath("/settings"), false);
});

test("dashboard/data APIs are NOT public", () => {
  assert.equal(isPublicPath("/api/orders"), false);
  assert.equal(isPublicPath("/api/products"), false);
  assert.equal(isPublicPath("/api/summary"), false);
  assert.equal(isPublicPath("/api/reports"), false);
  assert.equal(isPublicPath("/api/auth/logout"), false);
});
