import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import { listOrders, isValidOrderStatus } from "@/lib/orders/listOrders";
import { updateOrderStatusById } from "@/lib/orders/updateOrderStatus";

test("isValidOrderStatus accepts only the four fixed statuses", () => {
  assert.equal(isValidOrderStatus("pending"), true);
  assert.equal(isValidOrderStatus("making"), true);
  assert.equal(isValidOrderStatus("done"), true);
  assert.equal(isValidOrderStatus("cancelled"), true);
  assert.equal(isValidOrderStatus("shipped"), false);
  assert.equal(isValidOrderStatus(""), false);
});

test("lists orders for the given business date only", async () => {
  const db = new FakeSupabase() as any;
  db.tables.orders.push(
    { id: "o1", order_number: "#260916-0001", business_date: "2026-09-16", product_name_snapshot: "OJ", quantity: 1, selling_price_snapshot: 20, cost_price_snapshot: 10, customer_name: "A", status: "pending", ordered_at: "2026-09-16T05:00:00Z" },
    { id: "o2", order_number: "#260917-0001", business_date: "2026-09-17", product_name_snapshot: "OJ", quantity: 1, selling_price_snapshot: 20, cost_price_snapshot: 10, customer_name: "B", status: "pending", ordered_at: "2026-09-17T05:00:00Z" }
  );

  const result = await listOrders(db, { businessDate: "2026-09-16" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "o1");
});

test("dashboard status update by id changes only status, preserving snapshots", async () => {
  const db = new FakeSupabase() as any;
  db.tables.orders.push({
    id: "o1",
    order_number: "#260916-0001",
    business_date: "2026-09-16",
    product_name_snapshot: "Orange Juice",
    quantity: 3,
    selling_price_snapshot: 20,
    cost_price_snapshot: 10,
    customer_name: "P'Kai",
    status: "pending",
  });

  const updated = await updateOrderStatusById(db, "o1", "done");

  assert.equal(updated.status, "done");
  assert.equal(updated.product_name_snapshot, "Orange Juice");
  assert.equal(updated.quantity, 3);
  assert.equal(updated.selling_price_snapshot, 20);
  assert.equal(updated.cost_price_snapshot, 10);
});
