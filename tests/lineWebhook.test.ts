import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./fakeSupabase.ts";
import { handleEvent } from "@/lib/line/handleLineEvent";

function withMockedFetch(capture: { calls: any[]; lastMessageId?: string }) {
  const original = globalThis.fetch;
  let counter = 0;
  globalThis.fetch = (async (_url: string, init: any) => {
    capture.calls.push(JSON.parse(init.body));
    counter += 1;
    const id = `mock-msg-${counter}`;
    capture.lastMessageId = id;
    return {
      ok: true,
      json: async () => ({ sentMessages: [{ id, quoteToken: `mock-quote-${counter}` }] }),
      text: async () => "",
    } as any;
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
  assert.match(result.replyText!, /^📦 คำสั่งซื้อ\nเลขที่\s+#\d{6}-0001/);
  assert.match(result.replyText!, /🟡 สั่งซื้อ$/);
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
  assert.match(result.replyText!, /🟢 รับออเดอร์$/);
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
  assert.match(result.replyText!, new RegExp(`เลขที่\\s+${orderNumber.replace(/[#-]/g, "\\$&")}`));
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
  assert.match(result.replyText!, /ลูกค้า\s+พี่ไก่/);
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
  assert.match(result.replyText!, /ลูกค้า\s+-/);
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
  assert.match(result.replyText!, /จำนวน\s+123/);
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

// --- Similar-product-before-create flow (new feature) ---

test("similar product: single match -> confirmation prompt, no order/product created yet", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-sim-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0, "no order should exist yet");
  assert.match(result.replyText!, /พบสินค้าที่ใกล้เคียง: ข้าวเหนียวขาว\+หมูทอด/);
  assert.match(result.replyText!, /พิมพ์ "ใช่"/);
  assert.equal(db.tables.pending_product_confirmations.length, 1);
  assert.equal(db.tables.pending_product_confirmations[0].mode, "confirm");
});

test("similar product: multiple matches -> numbered selection prompt", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  seedProduct(db, { id: "p2", name: "เหนียวขาวหมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-sim-2",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /1\. ข้าวเหนียวขาว\+หมูทอด/);
  assert.match(result.replyText!, /2\. เหนียวขาวหมูทอด/);
  assert.equal(db.tables.pending_product_confirmations[0].mode, "select");
});

test("no similar product -> create-product prompt", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม" }); // unrelated product
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-sim-3",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.match(result.replyText!, /ไม่พบสินค้าที่ใกล้เคียง/);
  assert.match(result.replyText!, /ต้องการสร้างสินค้าใหม่หรือไม่/);
  assert.equal(db.tables.pending_product_confirmations[0].mode, "create");
});

test("ใช่ consumes the pending state and completes the original order", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด", selling_price: 30, cost_price: 15 });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-yes-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-yes-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "ใช่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.pending_product_confirmations.length, 0, "pending state must be consumed");
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].product_name_snapshot, "ข้าวเหนียวขาว+หมูทอด");
  assert.equal(db.tables.orders[0].quantity, 1);
  assert.equal(db.tables.orders[0].customer_name, "ก๊อต");
  assert.equal(db.tables.orders[0].selling_price_snapshot, 30);
  assert.match(result.replyText!, /สินค้า\s+ข้าวเหนียวขาว\+หมูทอด(?!\+แหนม)/);
});

test("เลือก N consumes the pending state and completes the order with the chosen product", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  seedProduct(db, { id: "p2", name: "เหนียวขาวหมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-sel-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-sel-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "เลือก 2" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.pending_product_confirmations.length, 0);
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].product_name_snapshot, "เหนียวขาวหมูทอด");
});

test("สร้าง 50 creates the product and continues the original order automatically", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-create-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-create-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "สร้าง 50" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.pending_product_confirmations.length, 0);
  assert.equal(db.tables.products.length, 2, "new product should be created");
  const newProduct = db.tables.products.find((p: any) => p.name === "ข้าวเหนียวขาว+หมูทอด+แหนม");
  assert.ok(newProduct);
  assert.equal(newProduct!.selling_price, 50);
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].product_name_snapshot, "ข้าวเหนียวขาว+หมูทอด+แหนม");
  assert.equal(db.tables.orders[0].customer_name, "ก๊อต");
  assert.match(result.replyText!, /สินค้า\s+ข้าวเหนียวขาว\+หมูทอด\+แหนม/);
});

test("สร้าง 50 without any pending state does not create anything", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-stray-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "สร้าง 50" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.products.length, 1, "no product should be created");
  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /ไม่มีคำสั่งที่รอดำเนินการ/);
});

test("expired pending state: ใช่ after 5 minutes reports nothing pending and creates nothing", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-exp-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  // Simulate expiry by manually pushing expires_at into the past.
  db.tables.pending_product_confirmations[0].expires_at = new Date(Date.now() - 1000).toISOString();

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-exp-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "ใช่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /ไม่มีคำสั่งที่รอดำเนินการ/);
});

test("two users in the same LINE group cannot resolve each other's pending requests", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  // User A triggers a pending confirmation.
  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-cross-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-A", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  // User B (different person, same group) tries to confirm it.
  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-cross-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-B", type: "group" },
      message: { type: "text", text: "ใช่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0, "user B must not be able to resolve user A's pending request");
  assert.match(result.replyText!, /ไม่มีคำสั่งที่รอดำเนินการ/);
  assert.equal(db.tables.pending_product_confirmations.length, 1, "user A's pending request is untouched");
});

test("missing userId fallback: two senders with no userId in the same group share group-level scope", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-nouid-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", type: "group" }, // no userId provided by LINE
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-nouid-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", type: "group" }, // also no userId
      message: { type: "text", text: "ใช่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 1, "group-level fallback scope should resolve successfully");
  assert.match(result.replyText!, /สินค้า\s+ข้าวเหนียวขาว\+หมูทอด(?!\+แหนม)/);
});

test("invalid selection (เลือก 3 with only 2 candidates) does not create an order", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ข้าวเหนียวขาว+หมูทอด" });
  seedProduct(db, { id: "p2", name: "เหนียวขาวหมูทอด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-badsel-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-badsel-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "เลือก 3" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /กรุณาเลือกหมายเลข 1-2/);
  assert.equal(db.tables.pending_product_confirmations.length, 1, "pending state stays intact for a retry");
});

test("invalid price (สร้าง abc / สร้าง -50 / สร้าง 0) does not create a product", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-badprice-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!ข้าวเหนียวขาว+หมูทอด+แหนม 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  const abc = await handleEvent(
    { type: "message", webhookEventId: "evt-badprice-2", replyToken: "r2", source: { groupId: "group-1", userId: "user-1", type: "group" }, message: { type: "text", text: "สร้าง abc" } } as any,
    db as any,
    "fake-token"
  );
  const negative = await handleEvent(
    { type: "message", webhookEventId: "evt-badprice-3", replyToken: "r3", source: { groupId: "group-1", userId: "user-1", type: "group" }, message: { type: "text", text: "สร้าง -50" } } as any,
    db as any,
    "fake-token"
  );
  const zero = await handleEvent(
    { type: "message", webhookEventId: "evt-badprice-4", replyToken: "r4", source: { groupId: "group-1", userId: "user-1", type: "group" }, message: { type: "text", text: "สร้าง 0" } } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.products.length, 1, "no product should be created from any invalid price");
  assert.equal(db.tables.orders.length, 0);
  assert.match(abc.replyText!, /ราคาไม่ถูกต้อง/);
  assert.match(negative.replyText!, /ราคาไม่ถูกต้อง/);
  assert.match(zero.replyText!, /ราคาไม่ถูกต้อง/);
  assert.equal(db.tables.pending_product_confirmations.length, 1, "pending state stays intact for a retry");
});

test("existing Damerau-Levenshtein <= 1 ambiguous-product behavior is unaffected by the new similarity tier", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "ABC" });
  seedProduct(db, { id: "p2", name: "ABD" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-existing-ambig",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!AB 1 customer" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 0);
  assert.match(result.replyText!, /พบสินค้าที่เป็นไปได้หลายรายการ/);
  assert.equal(db.tables.pending_product_confirmations.length, 0, "the OLD ambiguous-fuzzy path must not touch pending state at all");
});

// --- Reply-to-order-message feature ---

test("replying with a bare digit to the bot's order message updates that order", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-reply-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const trackedId = db.tables.orders[0].last_line_message_id;
  assert.ok(trackedId, "order should have a tracked LINE message id after the first reply");

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-reply-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "2", quotedMessageId: trackedId },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].status, "making");
  assert.match(result.replyText!, /^✅ อัปเดตคำสั่งซื้อ/);
  assert.match(result.replyText!, /สถานะใหม่/);
  assert.match(result.replyText!, /🟢 รับออเดอร์/);
});

test("replying with a Thai status word to the bot's order message updates that order", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-reply-th-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const trackedId = db.tables.orders[0].last_line_message_id;

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-reply-th-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "ชำระเงินแล้ว", quotedMessageId: trackedId },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].status, "done");
  assert.match(result.replyText!, /✅ ชำระเงินแล้ว/);
});

test("replying to an unrelated (unrecognized) message does not update any order", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-unrel-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-unrel-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "2", quotedMessageId: "some-totally-unrelated-message-id" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].status, "pending", "order must remain untouched");
  assert.equal(result.replied, false, "no reply should be sent for an unrelated quoted message");
});

test("replying to a stale (superseded) order message is safely ignored, never guesses", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-stale-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const originalMessageId = db.tables.orders[0].last_line_message_id;

  // A newer status-change message supersedes the original -- the order's
  // tracked id now points at THIS reply, not the original creation reply.
  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-stale-update",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!#" + db.tables.orders[0].order_number.slice(1) + " 2" },
    } as any,
    db as any,
    "fake-token"
  );

  assert.notEqual(db.tables.orders[0].last_line_message_id, originalMessageId);

  // User replies to the ORIGINAL (now stale) message.
  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-stale-reply",
      replyToken: "reply-3",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "4", quotedMessageId: originalMessageId },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].status, "making", "status must remain whatever the newer message set it to");
  assert.equal(result.replied, false);
});

test("explicit order-number commands still work exactly as before, unaffected by reply-to-message", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-explicit-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const orderNumber = db.tables.orders[0].order_number;

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-explicit-2",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: `!${orderNumber} 3` }, // no "#", no quotedMessageId
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders[0].status, "done");
  assert.match(result.replyText!, /✅ อัปเดตคำสั่งซื้อ/);
});

// --- Multi-line order input ---

test("multi-line: two lines, ! on both, creates 2 separate orders", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-1",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 2 ทราย\n!น้ำแครอท 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.equal(db.tables.orders[0].quantity, 2);
  assert.equal(db.tables.orders[0].customer_name, "ทราย");
  assert.equal(db.tables.orders[1].product_name_snapshot, "น้ำแครอท");
  assert.equal(db.tables.orders[1].quantity, 1);
  assert.equal(db.tables.orders[1].customer_name, "ก๊อต");
  assert.equal(result.replied, true);
  assert.match(result.replyText!, /น้ำส้ม/);
  assert.match(result.replyText!, /น้ำแครอท/);
});

test("multi-line: ! only on the first line, still creates 2 separate orders", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-2",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 2 ทราย\nน้ำแครอท 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.equal(db.tables.orders[1].product_name_snapshot, "น้ำแครอท");
});

test("multi-line: three lines create three orders with sequential order numbers", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  seedProduct(db, { id: "p3", name: "กาแฟเย็น", unit: "แก้ว" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-3",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 a\n!น้ำแครอท 1 b\n!กาแฟเย็น 1 c" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 3);
  const numbers = db.tables.orders.map((o: any) => o.order_number).sort();
  const suffixes = numbers.map((n: string) => n.split("-")[1]);
  assert.deepEqual(suffixes, ["0001", "0002", "0003"], "order numbers must be sequential");
});

test("multi-line: blank lines between orders are ignored", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-blank",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 2 ทราย\n\n\n!น้ำแครอท 1 ก๊อต\n" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
});

test("multi-line: \\r\\n line endings work the same as \\n", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-crlf",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 2 ทราย\r\n!น้ำแครอท 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
});

test("multi-line: multi-word products and customers work per line", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "Fried Rice Chicken Egg", unit: "" });
  seedProduct(db, { id: "p2", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-word",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!Fried Rice Chicken Egg 2 P'Boy Somchai\n!น้ำส้ม 1 พี่ไก่ สมชาย" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
  assert.equal(db.tables.orders[0].product_name_snapshot, "Fried Rice Chicken Egg");
  assert.equal(db.tables.orders[0].customer_name, "P'Boy Somchai");
  assert.equal(db.tables.orders[1].customer_name, "พี่ไก่ สมชาย");
});

test("multi-line: existing fuzzy product matching still works per line", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-fuzzy",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!นำส้ม 1 ไก่\n!น้ำแครอท 1 ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม"); // resolved via fuzzy match
});

test("multi-line: attached-number syntax works per line", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-attached",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม1 พี่ไก่\n!น้ำแครอท 1ขวด ก๊อต" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2);
  assert.equal(db.tables.orders[0].quantity, 1);
  assert.equal(db.tables.orders[0].customer_name, "พี่ไก่");
  assert.equal(db.tables.orders[1].quantity, 1);
  assert.equal(db.tables.orders[1].customer_name, "ก๊อต");
});

test("multi-line: error isolation -- an invalid/unknown line doesn't discard valid orders before or after it", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  seedProduct(db, { id: "p2", name: "น้ำแครอท", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-error",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: {
        type: "text",
        text: "!น้ำส้ม 2 ทราย\n!สินค้าที่ไม่มีอยู่จริง 1 ก๊อต\n!น้ำแครอท 1 ก๊อต",
      },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 2, "the two valid lines must both create orders");
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.equal(db.tables.orders[1].product_name_snapshot, "น้ำแครอท");
  assert.match(result.replyText!, /บรรทัดที่ 2/, "the failing line must be clearly reported by its line number");
  assert.match(result.replyText!, /ไม่พบสินค้า/);
});

test("multi-line: a newline inside an existing order-number status command does not become multiple commands", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-status-create",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  const orderNumber = db.tables.orders[0].order_number;

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-status-newline",
      replyToken: "reply-2",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      // The order number and status digit accidentally split across two
      // lines -- must behave exactly as the existing single-space form.
      message: { type: "text", text: `!${orderNumber}\n2` },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 1, "must not create a second order from this");
  assert.equal(db.tables.orders[0].status, "making");
  assert.match(result.replyText!, /✅ อัปเดตคำสั่งซื้อ/);
});

test("multi-line: a message mixing an order line with !summary falls back to the existing single-command behavior", async () => {
  const db = new FakeSupabase();
  seedProduct(db, { id: "p1", name: "น้ำส้ม", unit: "ขวด" });
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-multi-summary-mix",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 2 ทราย\n!summary" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  // Line 2 alone would be "!summary", which is a special command -- so the
  // WHOLE message fails multi-line classification (existing commands take
  // priority) and falls back to the pre-existing behavior for any
  // multi-line text: the whole raw string is parsed as ONE command by the
  // original tokenizer, which has always treated internal newlines as
  // plain whitespace (unchanged by this feature -- see the
  // "!<order> \\n <digit>" regression test above for the same fallback
  // rule applied to a status command). Here that means a single order IS
  // still created, with the stray "!summary" text absorbed into the
  // customer field rather than being treated as a separate command --
  // exactly the same as if this feature didn't exist at all.
  assert.equal(db.tables.orders.length, 1);
  assert.equal(db.tables.orders[0].product_name_snapshot, "น้ำส้ม");
  assert.match(db.tables.orders[0].customer_name, /ทราย/);
  assert.equal(result.replied, true);
});

test("single-line messages are completely unaffected by the multi-line feature (regression)", async () => {
  const db = new FakeSupabase();
  seedProduct(db);
  const calls: any[] = [];
  const restore = withMockedFetch({ calls });

  const result = await handleEvent(
    {
      type: "message",
      webhookEventId: "evt-single-regression",
      replyToken: "reply-1",
      source: { groupId: "group-1", userId: "user-1", type: "group" },
      message: { type: "text", text: "!น้ำส้ม 1 พี่ไก่" },
    } as any,
    db as any,
    "fake-token"
  );

  restore();

  assert.equal(db.tables.orders.length, 1);
  assert.match(result.replyText!, /^📦 คำสั่งซื้อ/);
});
