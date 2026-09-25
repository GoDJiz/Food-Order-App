import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderSummaryReply, buildDailySummaryReply } from "@/lib/line/buildReplyText";
import type { OrderRecord } from "@/lib/orders/getOrderByNumber";

test("order summary reply matches the approved example format exactly", () => {
  const order: OrderRecord = {
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

  const text = buildOrderSummaryReply(order, "ขวด");

  assert.equal(
    text,
    "สรุปคำสั่งซื้อ เลขที่ #260916-0001 สินค้า น้ำส้ม จำนวน 1 ขวด ชื่อลูกค้า พี่ไก่ สถานะ สั่งซื้อ"
  );
});

test("order summary reply reflects updated status without altering other fields", () => {
  const order: OrderRecord = {
    id: "1",
    order_number: "#260916-0001",
    business_date: "2026-09-16",
    product_name_snapshot: "น้ำส้ม",
    quantity: 1,
    selling_price_snapshot: 20,
    cost_price_snapshot: 10,
    customer_name: "พี่ไก่",
    status: "making",
  };

  const text = buildOrderSummaryReply(order, "ขวด");
  assert.match(text, /สถานะ รับออเดอร์$/);
  assert.match(text, /^สรุปคำสั่งซื้อ เลขที่ #260916-0001/);
});

test("daily summary reply stays short and includes totals", () => {
  const text = buildDailySummaryReply({
    lines: [
      { productName: "Orange Juice", quantity: 10, unit: "bottles" },
      { productName: "Iced Tea", quantity: 8, unit: "cups" },
      { productName: "Coffee", quantity: 6, unit: "cups" },
    ],
    totalOrders: 24,
    totalItems: 37,
    totalSales: 1850,
    totalProfit: 930,
  });

  assert.match(text, /Orange Juice 10 bottles/);
  assert.match(text, /รวม: 24 ออเดอร์ \/ 37 รายการ/);
  assert.match(text, /ยอดขาย: ฿1,850/);
  assert.match(text, /กำไร: ฿930/);
});
