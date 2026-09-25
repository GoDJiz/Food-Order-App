import { test } from "node:test";
import assert from "node:assert/strict";
import { statusFromCode, isValidStatusCode, thaiLabelFor } from "@/lib/orders/status";

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
