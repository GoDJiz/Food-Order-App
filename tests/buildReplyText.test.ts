import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderSummaryReply, buildOrderUpdatedReply, buildDailySummaryReply } from "@/lib/line/buildReplyText";
import type { OrderRecord } from "@/lib/orders/getOrderByNumber";

const baseOrder: OrderRecord = {
  id: "1",
  order_number: "#260916-0001",
  business_date: "2026-09-16",
  product_name_snapshot: "น้ำส้ม",
  quantity: 1,
  selling_price_snapshot: 20,
  cost_price_snapshot: 10,
  customer_name: "พี่ไก่",
  status: "pending",
};

test("order summary reply uses real line breaks, one field per line", () => {
  const text = buildOrderSummaryReply(baseOrder, "ขวด");
  const lines = text.split("\n");

  assert.ok(lines.length >= 6, "expected at least 6 separate lines");
  assert.equal(lines[0], "📦 คำสั่งซื้อ");
  assert.match(lines.find((l) => l.includes("เลขที่"))!, /#260916-0001/);
  assert.match(lines.find((l) => l.includes("สินค้า"))!, /น้ำส้ม/);
  assert.match(lines.find((l) => l.includes("จำนวน"))!, /1 ขวด/);
  assert.match(lines.find((l) => l.includes("ลูกค้า"))!, /พี่ไก่/);
  assert.ok(text.includes("สถานะ"));
  assert.match(text, /🟡 สั่งซื้อ/);
});

test("order summary reply shows a dash for an empty customer", () => {
  const text = buildOrderSummaryReply({ ...baseOrder, customer_name: "" }, "ขวด");
  assert.match(text, /ลูกค้า\s+-/);
});

test("order summary reply status emoji reflects each status", () => {
  const pending = buildOrderSummaryReply({ ...baseOrder, status: "pending" });
  const making = buildOrderSummaryReply({ ...baseOrder, status: "making" });
  const done = buildOrderSummaryReply({ ...baseOrder, status: "done" });
  const cancelled = buildOrderSummaryReply({ ...baseOrder, status: "cancelled" });

  assert.match(pending, /🟡 สั่งซื้อ/);
  assert.match(making, /🟢 รับออเดอร์/);
  assert.match(done, /✅ ชำระเงินแล้ว/);
  assert.match(cancelled, /🔴 ยกเลิก/);
});

test("order updated reply uses a distinct header and 'สถานะใหม่' label", () => {
  const text = buildOrderUpdatedReply({ ...baseOrder, status: "making" }, "ขวด");
  const lines = text.split("\n");

  assert.equal(lines[0], "✅ อัปเดตคำสั่งซื้อ");
  assert.ok(text.includes("สถานะใหม่"));
  assert.match(text, /🟢 รับออเดอร์/);
  assert.match(lines.find((l) => l.includes("เลขที่"))!, /#260916-0001/);
});

test("daily summary reply uses real line breaks and includes all key numbers", () => {
  const text = buildDailySummaryReply({
    lines: [
      { productName: "น้ำส้ม", quantity: 5, unit: "ขวด" },
      { productName: "ข้าวผัด", quantity: 4, unit: "กล่อง" },
    ],
    totalOrders: 8,
    totalItems: 15,
    totalSales: 850,
    totalProfit: 320,
  });

  const lines = text.split("\n");
  assert.ok(lines.length >= 7, "expected at least 7 separate lines");
  assert.equal(lines[0], "📊 สรุปวันนี้");
  assert.match(text, /🧾 ออเดอร์\s+8 รายการ/);
  assert.match(text, /📦 จำนวน\s+15 ชิ้น/);
  assert.match(text, /💰 ยอดขาย\s+฿850/);
  assert.match(text, /📈 กำไร\s+฿320/);
  assert.match(text, /• น้ำส้ม\s+5 ขวด/);
  assert.match(text, /• ข้าวผัด\s+4 กล่อง/);
});

test("daily summary reply omits a trailing unit when a product line has none", () => {
  const text = buildDailySummaryReply({
    lines: [{ productName: "Mystery Item", quantity: 3, unit: "" }],
    totalOrders: 1,
    totalItems: 3,
    totalSales: 100,
    totalProfit: 40,
  });
  assert.match(text, /• Mystery Item\s+3$/m);
});
