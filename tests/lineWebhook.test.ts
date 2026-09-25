import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import { handleEvent } from "@/lib/line/handleLineEvent";

function withMockedFetch(capture: { calls: any[] }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: any) => {
    capture.calls.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({}), text: async () => "" } as any;
  }) as any;
  return () => {
    globalThis.fetch = original;
  };
}

function seedProduct(db: FakeSupabase, overrides: Partial<any> = {}) {
  const product = {
    id: "prod-1",
    name: "น้ำส้ม",
    unit: "ขวด",
    selling_price: 20,
    cost_price: 10,
    active: true,
    ...overrides,
  };
  db.tables.products.push(product);
  return product;
}

test("new order event creates an order and replies with full summary", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    },
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(result.replied, true);
  assert.match(result.replyText!, /^สรุปคำสั่งซื้อ เลขที่ #\d{6}-0001/);
  assert.match(result.replyText!, /สถานะ สั่งซื้อ$/);
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].selling_price_snapshot, 20);
  assert.equal(db.tables.orders[0].cost_price_snapshot, 10);
  assert.equal(calls.length, 1);
});

test("duplicate LINE event is not processed twice", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const event = {
    type: "message",
    webhookEventId: "evt-dup",
    replyToken: "reply-1",
    source: { groupId: "group-1", type: "group" },
    message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
  };

  const first = await handleEvent(event as any, db as any, "fake-token");
  const second = await handleEvent(event as any, db as any, "fake-token"); // simulated retry

  restore();

  assert.equal(first.replied, true);
  assert.equal(second.replied, false);
  assert.equal(db.tables.orders.length, 1, "only one order should be created");
  assert.equal(calls.length, 1, "only one reply should be sent");
});

test("status change updates only status, preserving all snapshots", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-create",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const orderNumber = db.tables.orders[0].order_number;
  const before = { ...db.tables.orders[0] };

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-status",
      replyToken: "reply-2",
      message: { type: "text", text: `!${orderNumber} 2` },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  const after = db.tables.orders[0];

  assert.equal(result.replied, true);
  assert.match(result.replyText!, /สถานะ รับออเดอร์$/);
  assert.equal(after.status, "making");
  // Everything else must be untouched.
  assert.equal(after.product_name_snapshot, before.product_name_snapshot);
  assert.equal(after.customer_name, before.customer_name);
  assert.equal(after.quantity, before.quantity);
  assert.equal(after.selling_price_snapshot, before.selling_price_snapshot);
  assert.equal(after.cost_price_snapshot, before.cost_price_snapshot);
});

test("order lookup does not change status", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-create-2",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const orderNumber = db.tables.orders[0].order_number;
  const statusBefore = db.tables.orders[0].status;

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-lookup",
      replyToken: "reply-2",
      message: { type: "text", text: `!${orderNumber}` },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(result.replied, true);
  assert.equal(db.tables.orders[0].status, statusBefore, "lookup must not change status");
  assert.match(result.replyText!, new RegExp(`เลขที่ ${orderNumber.replace(/[#-]/g, "\\$&")}`));
});

test("invalid status code (9) is rejected with a clear error and no change", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-create-3",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const orderNumber = db.tables.orders[0].order_number;

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-bad-status",
      replyToken: "reply-2",
      message: { type: "text", text: `!${orderNumber} 9` },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.match(result.replyText!, /สถานะไม่ถูกต้อง/);
  assert.equal(db.tables.orders[0].status, "pending", "status must remain unchanged");
});

test("nonexistent order number returns not-found error", async () => {
  const db = new FakeSupabase();
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-missing",
      replyToken: "reply-1",
      message: { type: "text", text: "!#999999-9999 2" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.match(result.replyText!, /ไม่พบคำสั่งซื้อ/);
});

test("ordinary group chat message (no leading !) is ignored, no reply sent", async () => {
  const db = new FakeSupabase();
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-chat",
      replyToken: "reply-1",
      message: { type: "text", text: "sounds good, see you at 5" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(result.replied, false);
  assert.equal(calls.length, 0);
});

test("unit word appearing between quantity and customer is stripped from the reply", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-unit-1",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 1 ขวด พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(result.replied, true);
  assert.equal(db.tables.orders[0].customer_name, "พี่ไก่");
  assert.match(result.replyText!, /ชื่อลูกค้า พี่ไก่/);
});

test("unit word after customer is stripped, customer not polluted", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-unit-2",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม ไก่ 3 ขวด" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].customer_name, "ไก่");
  assert.equal(db.tables.orders[0].quantity, 3);
});

test("quantity before customer via typo'd product name (one-character deletion)", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-typo-1",
      replyToken: "reply-1",
      message: { type: "text", text: "!นำส้ม 1 ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.equal(db.tables.orders[0].customer_name, "ไก่");
});

test("quantity after customer via a different typo'd product name", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-typo-2",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำสม พี่ไก่ 3" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.equal(db.tables.orders[0].customer_name, "พี่ไก่");
  assert.equal(db.tables.orders[0].quantity, 3);
});

test("customer omitted entirely -> stored as empty string, reply shows a dash", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-no-customer",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 3 ขวด" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].customer_name, "");
  assert.match(result.replyText!, /ชื่อลูกค้า -/);
});

test("multiple numeric tokens are rejected without guessing; no order created", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-ambig-qty",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่ 2" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /ตัวเลขมากกว่า 1 ค่า/);
});

test("zero/negative/decimal quantities are rejected; no order created", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const zero = await handleEvent(
    { type: "message", webhookEventId: "evt-q-zero", replyToken: "r1", message: { type: "text", text: "!น้ำส้ม 0 พี่ไก่" } } as any,
    db as any,
    "fake-token"
  );
  const decimal = await handleEvent(
    { type: "message", webhookEventId: "evt-q-dec", replyToken: "r2", message: { type: "text", text: "!น้ำส้ม 1.5 พี่ไก่" } } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(zero.replyText!, /จำนวนไม่ถูกต้อง/);
  assert.match(decimal.replyText!, /จำนวนไม่ถูกต้อง/);
});

test("product not found (no plausible match at all)", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-no-product",
      replyToken: "reply-1",
      message: { type: "text", text: "!กาแฟเย็นสูตรพิเศษ 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /ไม่พบสินค้า/);
});

test("ambiguous fuzzy match across two similar active products -> no guessing", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ABC" });
  seedProduct(db, { id: "p2", name: "ABD" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-ambig-product",
      replyToken: "reply-1",
      message: { type: "text", text: "!AB 1 customer" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /พบสินค้าที่เป็นไปได้หลายรายการ/);
});

test("quantity-first messages are rejected, never guessed", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-qty-first",
      replyToken: "reply-1",
      message: { type: "text", text: "!3 น้ำส้ม พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.equal(result.replied, true);
});

test("snapshot price/cost independence for an order created via fuzzy-matched product name", async () => {
  const db = new FakeSupabase();
  const product = seedProduct(db, { id: "snap-1", name: "น้ำส้ม", selling_price: 20, cost_price: 10 });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-snap",
      replyToken: "reply-1",
      message: { type: "text", text: "!นำส้ม 1 ไก่" }, // typo'd, resolves via fuzzy match
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  const order = db.tables.orders[0];
  assert.equal(order.selling_price_snapshot, 20);
  assert.equal(order.cost_price_snapshot, 10);

  // Change the product's price after the order was placed.
  product.selling_price = 999;
  product.cost_price = 999;

  // The already-created order's snapshot must remain unchanged.
  assert.equal(db.tables.orders[0].selling_price_snapshot, 20);
  assert.equal(db.tables.orders[0].cost_price_snapshot, 10);
});

test("end-to-end: ABC123 resolves gracefully via existing product-prefix fallback (no rejection)", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-abc123",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม ABC123 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.equal(db.tables.orders[0].quantity, 123);
  assert.equal(db.tables.orders[0].customer_name, "ABC พี่ไก่");
  assert.match(result.replyText!, /จำนวน 123/);
});

test("end-to-end: digit inside customer text is never a second quantity once one is established", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-cust-digit",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่2" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].quantity, 1);
  assert.equal(db.tables.orders[0].customer_name, "พี่ไก่2");
});

test("end-to-end: attached digit+unit resolves like the whitespace-separated case", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-attach-unit",
      replyToken: "reply-1",
      message: { type: "text", text: "!น้ำส้ม 12ขวด พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].quantity, 12);
  assert.equal(db.tables.orders[0].customer_name, "พี่ไก่"); // unit stripped, not left in customer
});
