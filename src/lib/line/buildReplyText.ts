import type { OrderRecord } from "@/lib/orders/getOrderByNumber";
import { thaiLabelFor, type OrderStatus } from "@/lib/orders/status";

const STATUS_EMOJI: Record<OrderStatus, string> = {
  pending: "🟡",
  making: "🟢",
  done: "✅",
  cancelled: "🔴",
};

/**
 * Every order-related reply (new order / status change / lookup) shows the
 * COMPLETE current order state — order number, product, quantity, customer,
 * and current status. This is the fallback design for LINE's lack of a
 * bot-message-delete API: since we can't remove older messages, each reply
 * is self-contained so the newest message is always the full truth, and
 * staff never need to scroll up to reconstruct state.
 *
 * Multi-line, one field per line, for easy scanning on a phone screen --
 * these are real "\n" line breaks sent to the LINE API, not
 * space-separated text relying on client-side wrapping.
 */
export function buildOrderSummaryReply(order: OrderRecord, unit?: string): string {
  const unitPart = unit ? ` ${unit}` : "";
  const customerText = order.customer_name && order.customer_name.trim() ? order.customer_name : "-";
  return [
    "📦 คำสั่งซื้อ",
    `เลขที่  ${order.order_number}`,
    `สินค้า  ${order.product_name_snapshot}`,
    `จำนวน  ${order.quantity}${unitPart}`,
    `ลูกค้า  ${customerText}`,
    "สถานะ",
    `${STATUS_EMOJI[order.status]} ${thaiLabelFor(order.status)}`,
  ].join("\n");
}

/**
 * Same information as buildOrderSummaryReply, but for a status CHANGE
 * specifically (via "!#order code", a bare reply, or a quoted-message
 * reply) -- distinct header and "สถานะใหม่" (new status) label make it
 * visually clear at a glance that this message represents an update to an
 * existing order, not a brand-new one.
 */
export function buildOrderUpdatedReply(order: OrderRecord, unit?: string): string {
  const unitPart = unit ? ` ${unit}` : "";
  const customerText = order.customer_name && order.customer_name.trim() ? order.customer_name : "-";
  return [
    "✅ อัปเดตคำสั่งซื้อ",
    `เลขที่  ${order.order_number}`,
    `สินค้า  ${order.product_name_snapshot}`,
    `จำนวน  ${order.quantity}${unitPart}`,
    `ลูกค้า  ${customerText}`,
    "สถานะใหม่",
    `${STATUS_EMOJI[order.status]} ${thaiLabelFor(order.status)}`,
  ].join("\n");
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

/** Exactly one similar existing product found — requires explicit "ใช่". */
export function buildSimilarProductSingleReply(rawQuery: string, candidateName: string): string {
  return (
    `❗ ไม่พบสินค้าตรงชื่อ "${rawQuery}"\n` +
    `พบสินค้าที่ใกล้เคียง: ${candidateName}\n` +
    `ใช่สินค้านี้หรือไม่?\n` +
    `พิมพ์ "ใช่" เพื่อยืนยัน`
  );
}

/** Multiple plausible similar products found — requires "เลือก N". */
export function buildSimilarProductMultipleReply(rawQuery: string, candidateNames: string[]): string {
  const list = candidateNames.map((name, i) => `${i + 1}. ${name}`).join("\n");
  return (
    `❗ ไม่พบสินค้าตรงชื่อ "${rawQuery}"\n` +
    `พบสินค้าที่ใกล้เคียง:\n${list}\n` +
    `กรุณาเลือกสินค้า\n` +
    `เช่น\n` +
    `เลือก 1`
  );
}

/** No similar product at all — offers to create a new one via "สร้าง <price>". */
export function buildNoSimilarProductReply(rawQuery: string): string {
  return (
    `❗ ไม่พบสินค้าที่ใกล้เคียง\n` +
    `สินค้า: ${rawQuery}\n` +
    `ต้องการสร้างสินค้าใหม่หรือไม่?\n` +
    `กรุณาระบุราคาขาย เช่น\n` +
    `สร้าง 50`
  );
}

/** No active pending confirmation for ใช่ / เลือก N / สร้าง <price> — includes an already-expired one. */
export function buildNoPendingConfirmationReply(): string {
  return "ไม่มีคำสั่งที่รอดำเนินการ";
}

/** เลือก N where N is out of range for the candidates that were actually offered. */
export function buildInvalidSelectionReply(candidateCount: number): string {
  return `❗ กรุณาเลือกหมายเลข 1-${candidateCount}`;
}

/** สร้าง <price> where the price is missing, non-numeric, zero, or negative. */
export function buildInvalidPriceReply(): string {
  return "❗ ราคาไม่ถูกต้อง กรุณาระบุราคาที่มากกว่า 0 เช่น สร้าง 50";
}

export interface MultiLineOrderLineResult {
  lineNumber: number;
  success: boolean;
  /**
   * For a success: the full order-summary block (reused from
   * buildOrderSummaryReply, never rebuilt here). For a failure: the
   * underlying error message (reused from the existing per-error
   * builders), which this function prefixes with the line number.
   */
  text: string;
}

/**
 * Combines the per-line results of a multi-order LINE message into one
 * reply: each successful line's full order block, and each failed line's
 * error message prefixed with "บรรทัดที่ N" (Line N) so it's clear which
 * line it refers to. Valid orders are never hidden or rolled back just
 * because another line failed (rule 9) -- this function only formats
 * what the caller already decided to create/reject.
 */
export function buildMultiLineOrderReply(results: MultiLineOrderLineResult[]): string {
  const blocks = results.map((r) =>
    r.success ? r.text : `❗ บรรทัดที่ ${r.lineNumber}: ${r.text}`
  );
  return blocks.join("\n\n");
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
 * Compact, structured summary reply for "!summary" / "!สรุป" / "!สรุปออเดอร์"
 * -- key numbers first (each with its own emoji/label/line), then a short
 * bulleted per-product breakdown. Real line breaks throughout.
 */
export function buildDailySummaryReply(input: DailySummaryInput): string {
  const productLines = input.lines.map((l) => `• ${l.productName}  ${l.quantity} ${l.unit}`.trimEnd());

  return [
    "📊 สรุปวันนี้",
    `🧾 ออเดอร์   ${input.totalOrders} รายการ`,
    `📦 จำนวน    ${input.totalItems} ชิ้น`,
    `💰 ยอดขาย   ฿${input.totalSales.toLocaleString("en-US")}`,
    `📈 กำไร     ฿${input.totalProfit.toLocaleString("en-US")}`,
    "สินค้า",
    ...productLines,
  ].join("\n");
}
