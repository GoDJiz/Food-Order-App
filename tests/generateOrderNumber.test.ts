import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import { generateOrderNumber } from "@/lib/orders/generateOrderNumber";

test("generates sequential order numbers for the same business date", async () => {
  const db = new FakeSupabase() as any;
  const now = new Date("2026-09-16T05:00:00Z"); // 2026-09-16 12:00 Bangkok

  const first = await generateOrderNumber(db, now);
  const second = await generateOrderNumber(db, now);
  const third = await generateOrderNumber(db, now);

  assert.equal(first.orderNumber, "#260916-0001");
  assert.equal(second.orderNumber, "#260916-0002");
  assert.equal(third.orderNumber, "#260916-0003");
});

test("resets sequence to 0001 on a new business date", async () => {
  const db = new FakeSupabase() as any;
  const day1 = new Date("2026-09-16T05:00:00Z");
  const day2 = new Date("2026-09-17T05:00:00Z");

  const a = await generateOrderNumber(db, day1);
  const b = await generateOrderNumber(db, day1);
  const c = await generateOrderNumber(db, day2);

  assert.equal(a.orderNumber, "#260916-0001");
  assert.equal(b.orderNumber, "#260916-0002");
  assert.equal(c.orderNumber, "#260917-0001"); // resets for the new day
});

test("is safe under many concurrent requests on the same business date", async () => {
  const db = new FakeSupabase() as any;
  const now = new Date("2026-09-16T05:00:00Z");

  const results = await Promise.all(
    Array.from({ length: 50 }, () => generateOrderNumber(db, now))
  );

  const numbers = results.map((r) => r.orderNumber);
  const unique = new Set(numbers);

  assert.equal(unique.size, 50, "all 50 order numbers must be unique");

  const seqNumbers = numbers.map((n) => parseInt(n.split("-")[1], 10)).sort((a, b) => a - b);
  assert.deepEqual(seqNumbers, Array.from({ length: 50 }, (_, i) => i + 1));
});
