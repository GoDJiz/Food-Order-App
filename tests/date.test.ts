import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBusinessDate,
  businessDateToOrderPrefix,
  formatOrderNumber,
  isValidOrderNumberFormat,
} from "@/lib/date";

test("formats business date as YYYY-MM-DD in Asia/Bangkok", () => {
  // 2026-09-16T18:00:00Z is 2026-09-17 01:00 in Bangkok (+7)
  const d = new Date("2026-09-16T18:00:00Z");
  assert.equal(formatBusinessDate(d), "2026-09-17");
});

test("business date just before Bangkok midnight stays on the earlier day", () => {
  // 2026-09-16T16:59:00Z is 2026-09-16 23:59 in Bangkok
  const d = new Date("2026-09-16T16:59:00Z");
  assert.equal(formatBusinessDate(d), "2026-09-16");
});

test("converts business date to YYMMDD order prefix", () => {
  assert.equal(businessDateToOrderPrefix("2026-09-16"), "260916");
});

test("formats a full order number", () => {
  assert.equal(formatOrderNumber("2026-09-16", 1), "#260916-0001");
  assert.equal(formatOrderNumber("2026-09-16", 42), "#260916-0042");
  assert.equal(formatOrderNumber("2026-09-16", 9999), "#260916-9999");
});

test("validates order number format", () => {
  assert.equal(isValidOrderNumberFormat("#260916-0001"), true);
  assert.equal(isValidOrderNumberFormat("#26091-0001"), false);
  assert.equal(isValidOrderNumberFormat("260916-0001"), false);
  assert.equal(isValidOrderNumberFormat("#260916-001"), false);
  assert.equal(isValidOrderNumberFormat("#abcdef-0001"), false);
});
