import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitIntoNonBlankLines,
  ensureBangPrefix,
  isOrderInputKind,
  classifyAsMultiLineOrders,
} from "@/lib/line/splitOrderLines";

test("splits on backslash-n", () => {
  assert.deepEqual(splitIntoNonBlankLines("a\nb\nc"), ["a", "b", "c"]);
});

test("splits on backslash-r-backslash-n", () => {
  assert.deepEqual(splitIntoNonBlankLines("a\r\nb\r\nc"), ["a", "b", "c"]);
});

test("drops blank and whitespace-only lines", () => {
  assert.deepEqual(splitIntoNonBlankLines("a\n\n  \nb"), ["a", "b"]);
});

test("trims each line", () => {
  assert.deepEqual(splitIntoNonBlankLines("  a  \n  b  "), ["a", "b"]);
});

test("a single line (no newline) collapses to one element", () => {
  assert.deepEqual(splitIntoNonBlankLines("!น้ำส้ม 1 พี่ไก่"), ["!น้ำส้ม 1 พี่ไก่"]);
});

test("ensureBangPrefix adds bang only when missing", () => {
  assert.equal(ensureBangPrefix("น้ำแครอท 1 ก๊อต"), "!น้ำแครอท 1 ก๊อต");
  assert.equal(ensureBangPrefix("!น้ำแครอท 1 ก๊อต"), "!น้ำแครอท 1 ก๊อต");
});

test("isOrderInputKind classifies order-candidate kinds as true", () => {
  assert.equal(isOrderInputKind("new_order_tokens"), true);
  assert.equal(isOrderInputKind("invalid_order_format"), true);
  assert.equal(isOrderInputKind("ambiguous_quantity"), true);
  assert.equal(isOrderInputKind("invalid_quantity"), true);
});

test("isOrderInputKind classifies special-command kinds as false", () => {
  assert.equal(isOrderInputKind("order_lookup"), false);
  assert.equal(isOrderInputKind("order_status_change"), false);
  assert.equal(isOrderInputKind("summary"), false);
  assert.equal(isOrderInputKind("invalid_status_code"), false);
  assert.equal(isOrderInputKind("not_a_command"), false);
});

test("classifies bang on both lines as a multi-line order batch", () => {
  const result = classifyAsMultiLineOrders("!น้ำส้ม 2 ทราย\n!น้ำแครอท 1 ก๊อต");
  assert.ok(result);
  assert.equal(result!.length, 2);
  assert.equal(result![0].command.kind, "new_order_tokens");
  assert.equal(result![1].command.kind, "new_order_tokens");
  assert.equal(result![0].lineNumber, 1);
  assert.equal(result![1].lineNumber, 2);
});

test("classifies bang only on the first line as a multi-line order batch", () => {
  const result = classifyAsMultiLineOrders("!น้ำส้ม 2 ทราย\nน้ำแครอท 1 ก๊อต");
  assert.ok(result);
  assert.equal(result!.length, 2);
  assert.equal(result![0].command.kind, "new_order_tokens");
  assert.equal(result![1].command.kind, "new_order_tokens");
});

test("a single non-blank line is never treated as a multi-line batch", () => {
  assert.equal(classifyAsMultiLineOrders("!น้ำส้ม 1 พี่ไก่"), null);
});

test("the first line must start with bang -- otherwise not treated as a batch at all", () => {
  const result = classifyAsMultiLineOrders("น้ำส้ม 2 ทราย\nน้ำแครอท 1 ก๊อต");
  assert.equal(result, null);
});

test("blank lines between order lines are ignored, not counted as failures", () => {
  const result = classifyAsMultiLineOrders("!น้ำส้ม 2 ทราย\n\n!น้ำแครอท 1 ก๊อต");
  assert.ok(result);
  assert.equal(result!.length, 2);
});

test("a line that looks like a special command (order lookup) aborts multi-line classification entirely", () => {
  const result = classifyAsMultiLineOrders("!น้ำส้ม 2 ทราย\n!#260927-0001");
  assert.equal(result, null, "existing commands must take priority -- fall back to single-command parsing");
});

test("summary alias mixed with an order line aborts multi-line classification entirely", () => {
  const result = classifyAsMultiLineOrders("!น้ำส้ม 2 ทราย\n!summary");
  assert.equal(result, null);
});

test("an unknown-product order line is still included in the batch (error isolation happens later)", () => {
  const result = classifyAsMultiLineOrders("!น้ำส้ม 2 ทราย\n!สินค้าที่ไม่มีอยู่จริง 1 ก๊อต\n!น้ำแครอท 1 ก๊อต");
  assert.ok(result);
  assert.equal(result!.length, 3);
  assert.equal(result![0].command.kind, "new_order_tokens");
  assert.equal(result![1].command.kind, "new_order_tokens"); // Stage 1 has no product knowledge -- fails later at Stage 2
  assert.equal(result![2].command.kind, "new_order_tokens");
});

test("three lines all classify correctly with sequential line numbers", () => {
  const result = classifyAsMultiLineOrders("!a 1 x\n!b 2 y\n!c 3 z");
  assert.ok(result);
  assert.deepEqual(result!.map((r) => r.lineNumber), [1, 2, 3]);
});
