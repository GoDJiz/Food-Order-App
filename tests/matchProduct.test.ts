import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProduct, damerauLevenshtein } from "@/lib/orders/matchProduct";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "prod-1",
    name: "น้ำส้ม",
    unit: "ขวด",
    selling_price: 20,
    cost_price: 10,
    active: true,
    ...overrides,
  };
}

test("damerauLevenshtein: identical strings have distance 0", () => {
  assert.equal(damerauLevenshtein("abc", "abc"), 0);
});

test("damerauLevenshtein: one deletion has distance 1", () => {
  assert.equal(damerauLevenshtein("น้ำส้ม", "นำส้ม"), 1);
});

test("damerauLevenshtein: adjacent transposition has distance 1", () => {
  assert.equal(damerauLevenshtein("ab", "ba"), 1);
});

test("exact match wins, single-token product", () => {
  const products = [product({ name: "น้ำส้ม" })];
  const result = matchProduct(["น้ำส้ม", "1", "พี่ไก่"], 1, products);
  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.product.name, "น้ำส้ม");
    assert.equal(result.consumedCount, 1);
  }
});

test("exact match wins over a coincidentally-close fuzzy candidate", () => {
  const products = [product({ id: "p1", name: "น้ำส้ม" }), product({ id: "p2", name: "น้ำสม" })];
  const result = matchProduct(["น้ำส้ม", "1", "พี่ไก่"], 1, products);
  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.id, "p1");
});

test("exact match, longest prefix first, for multi-word products", () => {
  const products = [product({ id: "p1", name: "Fried Rice Chicken Egg" })];
  const tokens = ["Fried", "Rice", "Chicken", "Egg", "2", "P'Boy"];
  const result = matchProduct(tokens, 4, products);
  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.product.id, "p1");
    assert.equal(result.consumedCount, 4);
  }
});

test("one strong fuzzy match resolves confidently (single deletion typo)", () => {
  const products = [product({ name: "น้ำส้ม" })];
  const result = matchProduct(["นำส้ม", "1", "ไก่"], 1, products);
  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.name, "น้ำส้ม");
});

test("one strong fuzzy match resolves confidently (different single typo)", () => {
  const products = [product({ name: "น้ำส้ม" })];
  const result = matchProduct(["น้ำสม", "พี่ไก่", "3"], 2, products);
  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.name, "น้ำส้ม");
});

test("ambiguous: explicit deterministic tie constructed directly", () => {
  const products = [product({ id: "p1", name: "ABC" }), product({ id: "p2", name: "ABD" })];
  const result = matchProduct(["AB", "1", "customer"], 1, products);
  assert.equal(result.matched, false);
  if (!result.matched && result.reason === "ambiguous") {
    assert.deepEqual(new Set(result.candidates), new Set(["ABC", "ABD"]));
  } else {
    assert.fail("expected an ambiguous match result");
  }
});

test("product not found when nothing is within a strong fuzzy threshold", () => {
  const products = [product({ name: "น้ำส้ม" })];
  const result = matchProduct(["กาแฟเย็นสูตรพิเศษ", "1", "พี่ไก่"], 1, products);
  assert.equal(result.matched, false);
  if (!result.matched) assert.equal(result.reason, "not_found");
});

test("no candidate tokens before the quantity -> not_found, never guesses", () => {
  const products = [product({ name: "น้ำส้ม" })];
  const result = matchProduct(["1", "พี่ไก่"], 0, products);
  assert.equal(result.matched, false);
  if (!result.matched) assert.equal(result.reason, "not_found");
});

test("fuzzy matching never auto-creates or invents a product", () => {
  const products = [product({ id: "only-one", name: "น้ำส้ม" })];
  const result = matchProduct(["นำส้ม", "1", "ไก่"], 1, products);
  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.id, "only-one");
});

test("very short candidate is never fuzzy-matched", () => {
  const products = [product({ name: "AB" })];
  const result = matchProduct(["A", "1", "customer"], 1, products);
  assert.equal(result.matched, false);
});

// --- Step 1 regression tests: NFC normalization + defensive active filter ---

test("NFC normalization: NFD-composed candidate still exact-matches an NFC-stored product name", () => {
  const nfcName = "น้ำส้ม".normalize("NFC");
  const nfdCandidateToken = "น้ำส้ม".normalize("NFD"); // decomposed form of the same visual string
  const products = [product({ name: nfcName })];

  const result = matchProduct([nfdCandidateToken, "1", "พี่ไก่"], 1, products);

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.name, nfcName);
});

test("NFC normalization: NFD-composed catalog name still exact-matches an NFC-composed candidate", () => {
  const nfdName = "น้ำส้ม".normalize("NFD");
  const nfcCandidateToken = "น้ำส้ม".normalize("NFC");
  const products = [product({ name: nfdName })];

  const result = matchProduct([nfcCandidateToken, "1", "พี่ไก่"], 1, products);

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.name, nfdName);
});

test("NFC normalization: fuzzy distance is unaffected by normalization form mismatch", () => {
  // Same typo pair as the approved design review, but candidate and
  // catalog name deliberately stored in different normalization forms.
  const nfdName = "น้ำส้ม".normalize("NFD");
  const products = [product({ name: nfdName })];

  const result = matchProduct(["นำส้ม".normalize("NFC"), "1", "ไก่"], 1, products);

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.name, nfdName);
});

test("defensive active filter: an inactive product is never matched, even if passed in by the caller", () => {
  const onlyInactive = [product({ id: "inactive-1", name: "น้ำส้ม", active: false })];

  const result = matchProduct(["น้ำส้ม", "1", "ไก่"], 1, onlyInactive);

  assert.equal(result.matched, false);
  if (!result.matched) assert.equal(result.reason, "not_found");
});

test("defensive active filter: inactive duplicate does not cause false ambiguity with the active product", () => {
  const products = [
    product({ id: "active-1", name: "น้ำส้ม", active: true }),
    product({ id: "inactive-1", name: "น้ำส้ม", active: false }),
  ];

  const result = matchProduct(["น้ำส้ม", "1", "ไก่"], 1, products);

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.id, "active-1");
});

test("defensive active filter: an inactive product never contributes to an ambiguous fuzzy result", () => {
  // Only ONE active product is within the fuzzy threshold; an inactive
  // near-duplicate must not turn this into a false ambiguous result.
  const products = [
    product({ id: "active-1", name: "ABC", active: true }),
    product({ id: "inactive-1", name: "ABD", active: false }),
  ];

  const result = matchProduct(["AB", "1", "customer"], 1, products);

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.product.id, "active-1");
});
