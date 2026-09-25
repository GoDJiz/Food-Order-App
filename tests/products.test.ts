import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import { listProducts, createProduct, updateProduct, validateProductInput } from "@/lib/products/products";

test("validates required product fields", () => {
  assert.equal(validateProductInput({}), "Product name is required.");
  assert.equal(
    validateProductInput({ name: "Tea", selling_price: -1, cost_price: 1 }),
    "Selling price must be zero or greater."
  );
  assert.equal(
    validateProductInput({ name: "Tea", selling_price: 10, cost_price: -1 }),
    "Cost price must be zero or greater."
  );
  assert.equal(validateProductInput({ name: "Tea", selling_price: 10, cost_price: 5 }), null);
});

test("creates a product with only the approved fields", async () => {
  const db = new FakeSupabase() as any;
  const product = await createProduct(db, {
    name: "Orange Juice",
    unit: "bottle",
    selling_price: 20,
    cost_price: 10,
    active: true,
  });

  assert.equal(product.name, "Orange Juice");
  assert.equal(product.unit, "bottle");
  assert.equal(product.selling_price, 20);
  assert.equal(product.cost_price, 10);
  assert.equal(product.active, true);
});

test("rejects a duplicate product name (case-insensitive)", async () => {
  const db = new FakeSupabase() as any;
  await createProduct(db, { name: "Orange Juice", unit: "bottle", selling_price: 20, cost_price: 10, active: true });

  await assert.rejects(
    () => createProduct(db, { name: "orange juice", unit: "bottle", selling_price: 25, cost_price: 12, active: true }),
    /already exists/
  );
});

test("lists only active products by default", async () => {
  const db = new FakeSupabase() as any;
  await createProduct(db, { name: "Active One", unit: "", selling_price: 10, cost_price: 5, active: true });
  await createProduct(db, { name: "Inactive One", unit: "", selling_price: 10, cost_price: 5, active: false });

  const active = await listProducts(db);
  assert.equal(active.length, 1);
  assert.equal(active[0].name, "Active One");

  const all = await listProducts(db, { includeInactive: true });
  assert.equal(all.length, 2);
});

test("updates a product without touching unrelated fields", async () => {
  const db = new FakeSupabase() as any;
  const created = await createProduct(db, {
    name: "Coffee",
    unit: "cup",
    selling_price: 30,
    cost_price: 15,
    active: true,
  });

  const updated = await updateProduct(db, created.id, { selling_price: 35 });
  assert.equal(updated.selling_price, 35);
  assert.equal(updated.name, "Coffee"); // unchanged
  assert.equal(updated.cost_price, 15); // unchanged
});
