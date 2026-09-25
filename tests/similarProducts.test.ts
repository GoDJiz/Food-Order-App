import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSimilarProducts, sequenceMatcherRatio, SIMILARITY_THRESHOLD } from "@/lib/orders/similarProducts";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "id",
    name: "name",
    unit: "",
    selling_price: 10,
    cost_price: 5,
    active: true,
    ...overrides,
  };
}

test("threshold constant is exactly 0.75 as approved", () => {
  assert.equal(SIMILARITY_THRESHOLD, 0.75);
});

test("example 1a: missing trailing word, + separator", () => {
  const ratio = sequenceMatcherRatio("ข้าวเหนียวขาวหมูทอดแหนม", "ข้าวเหนียวขาวหมูทอด");
  assert.ok(ratio >= SIMILARITY_THRESHOLD, `expected >= 0.75, got ${ratio}`);
});

test("example 1b: missing prefix word, no separator (concatenated)", () => {
  const ratio = sequenceMatcherRatio("ข้าวเหนียวขาวหมูทอดแหนม", "เหนียวขาวหมูทอด");
  assert.ok(ratio >= SIMILARITY_THRESHOLD, `expected >= 0.75, got ${ratio}`);
});

test("example 2a: exact match after compacting different separators", () => {
  const ratio = sequenceMatcherRatio("ข้าวเหนียวดำหมูทอดแหนมทอด", "ข้าวเหนียวดำหมูทอดแหนมทอด");
  assert.equal(ratio, 1);
});

test("example 2b: concatenated variant", () => {
  const ratio = sequenceMatcherRatio("ข้าวเหนียวดำหมูทอดแหนมทอด", "เหนียวดำหมูทอดแหนมทอด");
  assert.ok(ratio >= SIMILARITY_THRESHOLD, `expected >= 0.75, got ${ratio}`);
});

test("example 2c: typo + missing word, concatenated", () => {
  const ratio = sequenceMatcherRatio("ข้าวเหนียวดำหมูทอดแหนมทอด", "เหนีวดำหมูทอดแหนม");
  assert.ok(ratio >= SIMILARITY_THRESHOLD, `expected >= 0.75, got ${ratio}`);
});

test("false positive guard: orange juice vs lime juice", () => {
  const ratio = sequenceMatcherRatio("น้ำส้ม", "น้ำมะนาว");
  assert.ok(ratio < SIMILARITY_THRESHOLD, `expected < 0.75, got ${ratio}`);
});

test("false positive guard: iced coffee vs iced tea", () => {
  const ratio = sequenceMatcherRatio("กาแฟเย็น", "ชาเย็น");
  assert.ok(ratio < SIMILARITY_THRESHOLD, `expected < 0.75, got ${ratio}`);
});

test("false positive guard: fried rice pork vs fried rice chicken", () => {
  const ratio = sequenceMatcherRatio("ข้าวผัดหมู", "ข้าวผัดไก่");
  assert.ok(ratio < SIMILARITY_THRESHOLD, `expected < 0.75, got ${ratio}`);
});

test("no similar products -> kind none", () => {
  const products = [product({ name: "น้ำส้ม" })];
  const result = searchSimilarProducts("กาแฟเย็นสูตรพิเศษ", products);
  assert.equal(result.kind, "none");
});

test("single similar product -> kind single, never auto-selected by this tier alone", () => {
  const products = [product({ id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" })];
  const result = searchSimilarProducts("ข้าวเหนียวขาว+หมูทอด+แหนม", products);
  assert.equal(result.kind, "single");
  if (result.kind === "single") assert.equal(result.product.id, "p1");
});

test("two or more products clearing the threshold -> always kind multiple, never narrowed to one", () => {
  const products = [
    product({ id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" }),
    product({ id: "p2", name: "เหนียวขาวหมูทอด" }),
  ];
  const result = searchSimilarProducts("ข้าวเหนียวขาว+หมูทอด+แหนม", products);
  assert.equal(result.kind, "multiple");
  if (result.kind === "multiple") {
    assert.equal(result.candidates.length, 2);
    assert.deepEqual(new Set(result.candidates.map((c) => c.id)), new Set(["p1", "p2"]));
  }
});

test("inactive products are never returned as similar candidates", () => {
  const products = [product({ id: "p1", name: "ข้าวเหนียวขาว+หมูทอด", active: false })];
  const result = searchSimilarProducts("ข้าวเหนียวขาว+หมูทอด+แหนม", products);
  assert.equal(result.kind, "none");
});

test("very short query is never similarity-matched (min length guard)", () => {
  const products = [product({ name: "ไก่" })];
  const result = searchSimilarProducts("ก", products);
  assert.equal(result.kind, "none");
});

test("clear single match wins when it beats the runner-up by more than the ambiguity margin", () => {
  const products = [
    product({ id: "p1", name: "ข้าวเหนียวดำ+หมูทอด+แหนมทอด" }),
    product({ id: "p2", name: "ข้าวเหนียวขาว+หมูทอด" }),
  ];
  const result = searchSimilarProducts("ข้าวเหนียวดำ+หมูทอด+แหนมทอด", products);
  assert.equal(result.kind, "single");
  if (result.kind === "single") assert.equal(result.product.id, "p1");
});
