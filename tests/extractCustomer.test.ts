import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCustomer } from "@/lib/orders/extractCustomer";

test("basic case: product then qty then customer", () => {
  const tokens = ["น้ำส้ม", "1", "พี่ไก่"];
  assert.equal(extractCustomer(tokens, 1, 1, "ขวด"), "พี่ไก่");
});

test("unit before customer is stripped", () => {
  const tokens = ["น้ำส้ม", "1", "ขวด", "พี่ไก่"];
  assert.equal(extractCustomer(tokens, 1, 1, "ขวด"), "พี่ไก่");
});

test("unit after customer is stripped", () => {
  const tokens = ["น้ำส้ม", "ไก่", "3", "ขวด"];
  assert.equal(extractCustomer(tokens, 2, 1, "ขวด"), "ไก่");
});

test("customer before quantity", () => {
  const tokens = ["น้ำสม", "พี่ไก่", "3"];
  assert.equal(extractCustomer(tokens, 2, 1, "ขวด"), "พี่ไก่");
});

test("customer omitted entirely -> empty string, not an error", () => {
  const tokens = ["น้ำส้ม", "3", "ขวด"];
  assert.equal(extractCustomer(tokens, 1, 1, "ขวด"), "");
});

test("multi-word customer preserved in order", () => {
  const tokens = ["น้ำส้ม", "1", "พี่ไก่", "สมชาย"];
  assert.equal(extractCustomer(tokens, 1, 1, "ขวด"), "พี่ไก่ สมชาย");
});

test("unit word does not leak into a multi-word customer name", () => {
  const tokens = ["น้ำส้ม", "พี่ไก่", "สมชาย", "3", "ขวด"];
  assert.equal(extractCustomer(tokens, 3, 1, "ขวด"), "พี่ไก่ สมชาย");
});

test("only the first occurrence of the unit token is stripped", () => {
  const tokens = ["น้ำส้ม", "1", "ขวด", "ขวด"]; // customer literally typed "ขวด" twice
  assert.equal(extractCustomer(tokens, 1, 1, "ขวด"), "ขวด");
});

test("blank product unit strips nothing", () => {
  const tokens = ["น้ำส้ม", "1", "ขวด", "พี่ไก่"];
  assert.equal(extractCustomer(tokens, 1, 1, ""), "ขวด พี่ไก่");
});

test("an arbitrary word that is not the configured unit is never stripped", () => {
  const tokens = ["น้ำส้ม", "1", "แก้ว", "พี่ไก่"]; // "แก้ว" (glass) is not this product's unit
  assert.equal(extractCustomer(tokens, 1, 1, "ขวด"), "แก้ว พี่ไก่");
});

test("multi-word product prefix correctly excluded from customer", () => {
  const tokens = ["Fried", "Rice", "Chicken", "Egg", "2", "P'Boy"];
  assert.equal(extractCustomer(tokens, 4, 4, ""), "P'Boy");
});
