import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import {
  getActivePendingConfirmation,
  createPendingConfirmation,
  consumePendingConfirmation,
} from "@/lib/orders/pendingConfirmation";

test("returns null when nothing is pending", async () => {
  const db = new FakeSupabase() as any;
  const result = await getActivePendingConfirmation(db, "group-1", "user-1");
  assert.equal(result, null);
});

test("creates and retrieves a pending confirmation scoped by group+user", async () => {
  const db = new FakeSupabase() as any;
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-1",
    mode: "confirm",
    rawQuery: "ข้าวเหนียวขาว+หมูทอด+แหนม",
    candidates: [{ id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" }],
    quantity: 1,
    customerName: "ก๊อต",
  });

  const result = await getActivePendingConfirmation(db, "group-1", "user-1");
  assert.ok(result);
  assert.equal(result!.mode, "confirm");
  assert.equal(result!.candidates.length, 1);
  assert.equal(result!.quantity, 1);
  assert.equal(result!.customer_name, "ก๊อต");
});

test("creating a new pending confirmation replaces the old one for the same scope", async () => {
  const db = new FakeSupabase() as any;
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-1",
    mode: "confirm",
    rawQuery: "first",
    candidates: [],
    quantity: 1,
    customerName: "a",
  });
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-1",
    mode: "create",
    rawQuery: "second",
    candidates: [],
    quantity: 2,
    customerName: "b",
  });

  assert.equal(db.tables.pending_product_confirmations.length, 1);
  const result = await getActivePendingConfirmation(db, "group-1", "user-1");
  assert.equal(result!.raw_query, "second");
});

test("expired pending confirmation is treated as none and cleaned up", async () => {
  const db = new FakeSupabase() as any;
  const now = new Date("2026-09-25T12:00:00Z");
  await createPendingConfirmation(
    db,
    {
      groupId: "group-1",
      userId: "user-1",
      mode: "confirm",
      rawQuery: "x",
      candidates: [{ id: "p1", name: "x" }],
      quantity: 1,
      customerName: "a",
    },
    now
  );

  const sixMinutesLater = new Date(now.getTime() + 6 * 60 * 1000);
  const result = await getActivePendingConfirmation(db, "group-1", "user-1", sixMinutesLater);

  assert.equal(result, null);
  assert.equal(db.tables.pending_product_confirmations.length, 0, "expired row should be cleaned up");
});

test("pending confirmation is still active within the 5-minute window", async () => {
  const db = new FakeSupabase() as any;
  const now = new Date("2026-09-25T12:00:00Z");
  await createPendingConfirmation(
    db,
    {
      groupId: "group-1",
      userId: "user-1",
      mode: "confirm",
      rawQuery: "x",
      candidates: [{ id: "p1", name: "x" }],
      quantity: 1,
      customerName: "a",
    },
    now
  );

  const fourMinutesLater = new Date(now.getTime() + 4 * 60 * 1000);
  const result = await getActivePendingConfirmation(db, "group-1", "user-1", fourMinutesLater);
  assert.ok(result);
});

test("two different users in the same group have independent pending confirmations", async () => {
  const db = new FakeSupabase() as any;
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-A",
    mode: "confirm",
    rawQuery: "A's order",
    candidates: [],
    quantity: 1,
    customerName: "a",
  });
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-B",
    mode: "create",
    rawQuery: "B's order",
    candidates: [],
    quantity: 2,
    customerName: "b",
  });

  const forA = await getActivePendingConfirmation(db, "group-1", "user-A");
  const forB = await getActivePendingConfirmation(db, "group-1", "user-B");

  assert.equal(forA!.raw_query, "A's order");
  assert.equal(forB!.raw_query, "B's order");
});

test("missing userId (null) falls back to a group-level scope, distinct from any known user's scope", async () => {
  const db = new FakeSupabase() as any;
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-A",
    mode: "confirm",
    rawQuery: "A's order",
    candidates: [],
    quantity: 1,
    customerName: "a",
  });
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: null,
    mode: "create",
    rawQuery: "anonymous order",
    candidates: [],
    quantity: 1,
    customerName: "c",
  });

  const forA = await getActivePendingConfirmation(db, "group-1", "user-A");
  const forAnon = await getActivePendingConfirmation(db, "group-1", null);

  assert.equal(forA!.raw_query, "A's order");
  assert.equal(forAnon!.raw_query, "anonymous order");
});

test("consuming a pending confirmation removes it", async () => {
  const db = new FakeSupabase() as any;
  await createPendingConfirmation(db, {
    groupId: "group-1",
    userId: "user-1",
    mode: "confirm",
    rawQuery: "x",
    candidates: [{ id: "p1", name: "x" }],
    quantity: 1,
    customerName: "a",
  });

  const before = await getActivePendingConfirmation(db, "group-1", "user-1");
  await consumePendingConfirmation(db, before!.id);

  const after = await getActivePendingConfirmation(db, "group-1", "user-1");
  assert.equal(after, null);
});
