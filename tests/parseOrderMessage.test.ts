import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrderMessage } from "@/lib/line/parseOrderMessage";

test("tokenizes a basic new order candidate (Stage 1 only — product not yet resolved)", () => {
  const r = parseOrderMessage("!น้ำส้ม 1 พี่ไก่");
  assert.deepEqual(r, {
    kind: "new_order_tokens",
    tokens: ["น้ำส้ม", "1", "พี่ไก่"],
    quantity: 1,
    qtyIndex: 1,
  });
});

test("multi-word product regression: quantity located correctly", () => {
  const r = parseOrderMessage("!Fried Rice Chicken Egg 2 P'Boy");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.equal(r.quantity, 2);
    assert.equal(r.qtyIndex, 4); // "Fried","Rice","Chicken","Egg" = 4 tokens before qty
  }
});

test("multi-word customer: quantity index unaffected by trailing words", () => {
  const r = parseOrderMessage("!น้ำส้ม 1 พี่ไก่ สมชาย");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "พี่ไก่", "สมชาย"]);
    assert.equal(r.qtyIndex, 1);
  }
});

test("quantity after customer is located correctly", () => {
  const r = parseOrderMessage("!น้ำสม พี่ไก่ 3");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำสม", "พี่ไก่", "3"]);
    assert.equal(r.qtyIndex, 2);
    assert.equal(r.quantity, 3);
  }
});

test("unit word before customer does not confuse quantity detection", () => {
  const r = parseOrderMessage("!น้ำส้ม 1 ขวด พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "ขวด", "พี่ไก่"]);
    assert.equal(r.qtyIndex, 1);
  }
});

test("unit word after customer does not confuse quantity detection", () => {
  const r = parseOrderMessage("!น้ำส้ม ไก่ 3 ขวด");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "ไก่", "3", "ขวด"]);
    assert.equal(r.qtyIndex, 2);
  }
});

test("customer may be entirely omitted", () => {
  const r = parseOrderMessage("!น้ำส้ม 3 ขวด");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "3", "ขวด"]);
    assert.equal(r.qtyIndex, 1);
  }
});

test("extra whitespace between tokens is normalized away", () => {
  const r = parseOrderMessage("!น้ำส้ม   1    พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "พี่ไก่"]);
  }
});

test("missing quantity (no numeric token) is invalid format", () => {
  const r = parseOrderMessage("!Orange Juice");
  assert.equal(r.kind, "invalid_order_format");
});

test("missing quantity with a customer-like word present", () => {
  const r = parseOrderMessage("!น้ำส้ม พี่ไก่");
  assert.equal(r.kind, "invalid_order_format");
});

test("non-numeric token where quantity expected is invalid format", () => {
  const r = parseOrderMessage("!Orange Juice abc P'Kai");
  assert.equal(r.kind, "invalid_order_format");
});

test("zero quantity is rejected with a specific reason", () => {
  const r = parseOrderMessage("!น้ำส้ม 0 พี่ไก่");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "zero_or_negative" });
});

test("negative quantity is rejected with a specific reason", () => {
  const r = parseOrderMessage("!Orange Juice -1 P'Kai");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "zero_or_negative" });
});

test("decimal quantity is rejected with a specific reason", () => {
  const r = parseOrderMessage("!น้ำส้ม 1.5 พี่ไก่");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "decimal" });
});

test("multiple numeric tokens is ambiguous, never guessed", () => {
  const r = parseOrderMessage("!น้ำส้ม 1 พี่ไก่ 2");
  assert.deepEqual(r, { kind: "ambiguous_quantity" });
});

test("quantity as the very first token is rejected (no room for a product)", () => {
  const r = parseOrderMessage("!3 น้ำส้ม พี่ไก่");
  assert.equal(r.kind, "invalid_order_format");
});

test("message not starting with ! is ignored, not treated as invalid", () => {
  const r = parseOrderMessage("just chatting in the group");
  assert.equal(r.kind, "not_a_command");
});

test("!summary is recognized", () => {
  assert.deepEqual(parseOrderMessage("!summary"), { kind: "summary" });
  assert.deepEqual(parseOrderMessage("!Summary"), { kind: "summary" });
});

test("order lookup command", () => {
  const r = parseOrderMessage("!#260916-0001");
  assert.deepEqual(r, { kind: "order_lookup", orderNumber: "#260916-0001" });
});

test("order status change commands", () => {
  assert.deepEqual(parseOrderMessage("!#260916-0001 2"), {
    kind: "order_status_change",
    orderNumber: "#260916-0001",
    statusCode: "2",
  });
  assert.deepEqual(parseOrderMessage("!#260916-0001 3"), {
    kind: "order_status_change",
    orderNumber: "#260916-0001",
    statusCode: "3",
  });
  assert.deepEqual(parseOrderMessage("!#260916-0001 4"), {
    kind: "order_status_change",
    orderNumber: "#260916-0001",
    statusCode: "4",
  });
});

test("invalid status code", () => {
  const r = parseOrderMessage("!#260916-0001 9");
  assert.equal(r.kind, "invalid_status_code");
});

test("malformed order number", () => {
  const r = parseOrderMessage("!#abc-0001");
  assert.equal(r.kind, "invalid_order_format");
});

test("malformed order number with extra tokens", () => {
  const r = parseOrderMessage("!#260916-0001 2 extra");
  assert.equal(r.kind, "invalid_order_format");
});

// --- Attached-number tokenizer tests (Stage 1 boundary-first contract) ---

test("attached: digit stuck to end of product token", () => {
  const r = parseOrderMessage("!น้ำส้ม1 พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "พี่ไก่"]);
    assert.equal(r.qtyIndex, 1);
    assert.equal(r.quantity, 1);
  }
});

test("attached: digit stuck to start of customer token", () => {
  const r = parseOrderMessage("!น้ำส้ม 1พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "พี่ไก่"]);
    assert.equal(r.qtyIndex, 1);
  }
});

test("attached: digit stuck to end of customer token (quantity after customer)", () => {
  const r = parseOrderMessage("!น้ำส้ม พี่ไก่1");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "พี่ไก่", "1"]);
    assert.equal(r.qtyIndex, 2);
  }
});

test("attached: digit+unit stuck together, before customer", () => {
  const r = parseOrderMessage("!น้ำส้ม 1ขวด พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "ขวด", "พี่ไก่"]);
    assert.equal(r.qtyIndex, 1);
  }
});

test("attached: digit+unit stuck together, after customer", () => {
  const r = parseOrderMessage("!น้ำส้ม พี่ไก่ 1ขวด");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "พี่ไก่", "1", "ขวด"]);
    assert.equal(r.qtyIndex, 2);
  }
});

test("attached: multi-digit quantity stuck to unit", () => {
  const r = parseOrderMessage("!น้ำส้ม 12ขวด พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "12", "ขวด", "พี่ไก่"]);
    assert.equal(r.qtyIndex, 1);
    assert.equal(r.quantity, 12);
  }
});

test("two separate whole-token numbers remain ambiguous (unchanged behavior)", () => {
  const r = parseOrderMessage("!น้ำส้ม 1 2 พี่ไก่");
  assert.deepEqual(r, { kind: "ambiguous_quantity" });
});

test("two digit runs within one attached token is ambiguous", () => {
  const r = parseOrderMessage("!น้ำส้ม 1ขวด2 พี่ไก่");
  assert.deepEqual(r, { kind: "ambiguous_quantity" });
});

test("letters+digits attached token still tokenizes; product resolution is Stage 2's job", () => {
  const r = parseOrderMessage("!น้ำส้ม ABC123 พี่ไก่");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["น้ำส้ม", "ABC", "123", "พี่ไก่"]);
    assert.equal(r.qtyIndex, 2);
    assert.equal(r.quantity, 123);
  }
});

test("whole-token negative quantity behavior is fully preserved", () => {
  const r = parseOrderMessage("!น้ำส้ม -1 พี่ไก่");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "zero_or_negative" });
});

test("whole-token zero quantity behavior is fully preserved", () => {
  const r = parseOrderMessage("!น้ำส้ม 0 พี่ไก่");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "zero_or_negative" });
});

test("whole-token decimal quantity behavior is fully preserved", () => {
  const r = parseOrderMessage("!น้ำส้ม 1.5 พี่ไก่");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "decimal" });
});

test("attached decimal quantity is still detected and rejected", () => {
  const r = parseOrderMessage("!น้ำส้ม1.5 พี่ไก่");
  assert.deepEqual(r, { kind: "invalid_quantity", reason: "decimal" });
});

test("attached digit on a multi-word product's last token", () => {
  const r = parseOrderMessage("!Fried Rice Chicken Egg2 P'Boy");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    assert.deepEqual(r.tokens, ["Fried", "Rice", "Chicken", "Egg", "2", "P'Boy"]);
    assert.equal(r.qtyIndex, 4);
    assert.equal(r.quantity, 2);
  }
});

test("once a clear whole-token quantity exists, a digit inside customer text is never treated as another quantity", () => {
  const r = parseOrderMessage("!น้ำส้ม 1 พี่ไก่2");
  assert.equal(r.kind, "new_order_tokens");
  if (r.kind === "new_order_tokens") {
    // "2" inside "พี่ไก่2" must stay attached to the customer token,
    // completely untouched -- Pass 2 must never run here.
    assert.deepEqual(r.tokens, ["น้ำส้ม", "1", "พี่ไก่2"]);
    assert.equal(r.qtyIndex, 1);
    assert.equal(r.quantity, 1);
  }
});
