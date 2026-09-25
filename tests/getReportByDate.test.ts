import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import { getReportByDate } from "@/lib/orders/getReportByDate";
import { updateProduct } from "@/lib/products/products";

function seedOrder(db: FakeSupabase, overrides: Partial<any> = {}) {
  db.tables.orders.push({
    id: `order-${db.tables.orders.length + 1}`,
    order_number: `#260916-000${db.tables.orders.length + 1}`,
    business_date: "2026-09-16",
    product_id: "prod-1",
    product_name_snapshot: "Orange Juice",
    quantity: 2,
    selling_price_snapshot: 20,
    cost_price_snapshot: 10,
    customer_name: "P'Kai",
    status: "pending",
    ...overrides,
  });
}

test("aggregates revenue/cost/profit per product for a date", async () => {
  const db = new FakeSupabase() as any;
  seedOrder(db, { quantity: 2 });
  seedOrder(db, { quantity: 3 });
  seedOrder(db, { product_name_snapshot: "Iced Tea", selling_price_snapshot: 15, cost_price_snapshot: 7, quantity: 4 });

  const report = await getReportByDate(db, "2026-09-16");

  assert.equal(report.lines.length, 2);
  const ojLine = report.lines.find((l: any) => l.productName === "Orange Juice")!;
  assert.equal(ojLine.quantity, 5);
  assert.equal(ojLine.revenue, 100); // 5 * 20
  assert.equal(ojLine.cost, 50); // 5 * 10
  assert.equal(ojLine.profit, 50);

  assert.equal(report.totals.quantity, 9);
  assert.equal(report.totals.revenue, 100 + 60);
  assert.equal(report.totals.profit, 50 + 32);
});

test("excludes cancelled orders from report totals", async () => {
  const db = new FakeSupabase() as any;
  seedOrder(db, { quantity: 2, status: "pending" });
  seedOrder(db, { quantity: 100, status: "cancelled" });

  const report = await getReportByDate(db, "2026-09-16");
  assert.equal(report.totals.quantity, 2);
});

test("historical report is unaffected by later product price changes", async () => {
  const db = new FakeSupabase() as any;
  db.tables.products.push({ id: "prod-1", name: "Orange Juice", unit: "bottle", selling_price: 20, cost_price: 10, active: true });
  seedOrder(db, { quantity: 10, selling_price_snapshot: 20, cost_price_snapshot: 10 });

  const before = await getReportByDate(db, "2026-09-16");
  assert.equal(before.totals.revenue, 200);
  assert.equal(before.totals.profit, 100);

  // Product price changes after the fact.
  await updateProduct(db, "prod-1", { selling_price: 999, cost_price: 999 });

  const after = await getReportByDate(db, "2026-09-16");
  assert.equal(after.totals.revenue, 200, "historical revenue must not change");
  assert.equal(after.totals.profit, 100, "historical profit must not change");
});
