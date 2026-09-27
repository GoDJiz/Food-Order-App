import { test } from "node:test";
import assert from "node:assert/strict";
import { statusFromCode, isValidStatusCode, thaiLabelFor, parseBareStatusReply } from "@/lib/orders/status";

test("maps status codes 1-4 to internal English enum values", () => {
  assert.equal(statusFromCode("1"), "pending");
  assert.equal(statusFromCode("2"), "making");
  assert.equal(statusFromCode("3"), "done");
  assert.equal(statusFromCode("4"), "cancelled");
});

test("rejects invalid status codes", () => {
  assert.equal(isValidStatusCode("0"), false);
  assert.equal(isValidStatusCode("5"), false);
  assert.equal(isValidStatusCode("abc"), false);
  assert.equal(statusFromCode("9"), null);
});

test("Thai labels match the approved fixed options", () => {
  assert.equal(thaiLabelFor("pending"), "สั่งซื้อ");
  assert.equal(thaiLabelFor("making"), "รับออเดอร์");
  assert.equal(thaiLabelFor("done"), "ชำระเงินแล้ว");
  assert.equal(thaiLabelFor("cancelled"), "ยกเลิก");
});

test("parseBareStatusReply accepts digits 1-4", () => {
  assert.equal(parseBareStatusReply("1"), "1");
  assert.equal(parseBareStatusReply("2"), "2");
  assert.equal(parseBareStatusReply("3"), "3");
  assert.equal(parseBareStatusReply("4"), "4");
});

test("parseBareStatusReply accepts the four Thai status words", () => {
  assert.equal(parseBareStatusReply("สั่งซื้อ"), "1");
  assert.equal(parseBareStatusReply("รับออเดอร์"), "2");
  assert.equal(parseBareStatusReply("ชำระเงินแล้ว"), "3");
  assert.equal(parseBareStatusReply("ยกเลิก"), "4");
});

test("parseBareStatusReply trims surrounding whitespace", () => {
  assert.equal(parseBareStatusReply("  2  "), "2");
  assert.equal(parseBareStatusReply(" รับออเดอร์ "), "2");
});

test("parseBareStatusReply rejects anything else", () => {
  assert.equal(parseBareStatusReply("5"), null);
  assert.equal(parseBareStatusReply("0"), null);
  assert.equal(parseBareStatusReply("hello"), null);
  assert.equal(parseBareStatusReply(""), null);
  assert.equal(parseBareStatusReply("รับ"), null);
});
