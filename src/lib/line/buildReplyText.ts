import type { OrderRecord } from "@/lib/orders/getOrderByNumber";
import { thaiLabelFor } from "@/lib/orders/status";

/**
 * Every order-related reply (new order / status change / lookup) shows the
 * COMPLETE current order state — order number, product, quantity, customer,
 * and current status. This is the fallback design for LINE's lack of a
 * bot-message-delete API: since we can't remove older messages, each reply
 * is self-contained so the newest message is always the full truth, and
 * staff never need to scroll up to reconstruct state.
 *
 * Format matches the approved example exactly:
 * "สรุปคำสั่งซื้อ เลขที่ #260916-0001 สินค้า น้ำส้ม จำนวน 1 ขวด ชื่อลูกค้า พี่ไก่ สถานะ สั่งซื้อ"
 */
export function buildOrderSummaryReply(order: OrderRecord, unit?: string): string {
  const unitPart = unit ? ` ${unit}` : "";
  const customerText = order.customer_name && order.customer_name.trim() ? order.customer_name : "-";
  return (
    `สรุปคำสั่งซื้อ เลขที่ ${order.order_number} ` +
    `สินค้า ${order.product_name_snapshot} ` +
    `จำนวน ${order.quantity}${unitPart} ` +
    `ชื่อลูกค้า ${customerText} ` +
    `สถานะ ${thaiLabelFor(order.status)}`
  );
}

export function buildInvalidOrderFormatReply(): string {
  return "❗Invalid format\nExample:\n!Orange Juice 1 P'Kai";
}

export function buildOrderNotFoundReply(orderNumber: string): string {
  return `❗ ไม่พบคำสั่งซื้อ ${orderNumber}`;
}

export function buildInvalidStatusCodeReply(): string {
  return "❗ สถานะไม่ถูกต้อง (ใช้เลข 1-4)";
}

export function buildProductNotFoundReply(productName: string): string {
  return `❗ ไม่พบสินค้า "${productName}" กรุณาตรวจสอบชื่อสินค้า`;
}

export function buildAmbiguousProductReply(candidates: string[]): string {
  const list = candidates.slice(0, 3).join(", ");
  return `❗ พบสินค้าที่เป็นไปได้หลายรายการ (${list}) กรุณาพิมพ์ชื่อสินค้าให้ตรงกับที่มีในระบบ`;
}

export function buildAmbiguousQuantityReply(): string {
  return "❗ พบตัวเลขมากกว่า 1 ค่า กรุณาระบุจำนวนให้ชัดเจน (ตัวเลขเดียว)";
}

export function buildInvalidQuantityReply(reason: "zero_or_negative" | "decimal"): string {
  if (reason === "decimal") {
    return "❗ จำนวนไม่ถูกต้อง กรุณาระบุจำนวนเป็นเลขจำนวนเต็มบวก (ไม่มีจุดทศนิยม)";
  }
  return "❗ จำนวนไม่ถูกต้อง กรุณาระบุจำนวนที่มากกว่า 0";
}

export interface DailySummaryLine {
  productName: string;
  quantity: number;
  unit: string;
}

export interface DailySummaryInput {
  lines: DailySummaryLine[];
  totalOrders: number;
  totalItems: number;
  totalSales: number;
  totalProfit: number;
}

/**
 * Short summary reply for "!summary" — intentionally brief per approved
 * design (not the full per-order detail used by order commands).
 */
export function buildDailySummaryReply(input: DailySummaryInput): string {
  const productLines = input.lines
    .map((l) => `${l.productName} ${l.quantity} ${l.unit}`.trim())
    .join("\n");

  return (
    `📦 สรุปวันนี้\n` +
    `${productLines}\n\n` +
    `รวม: ${input.totalOrders} ออเดอร์ / ${input.totalItems} รายการ\n` +
    `ยอดขาย: ฿${input.totalSales.toLocaleString("en-US")}\n` +
    `กำไร: ฿${input.totalProfit.toLocaleString("en-US")}`
  );
}
