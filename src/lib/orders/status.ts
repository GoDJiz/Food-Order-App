/**
 * Internal status values stay in English and match the existing Supabase
 * `order_status` enum (unchanged, per approved Phase 4/5 design). Thai
 * labels are display-only, used in LINE replies and the dashboard.
 */
export type OrderStatus = "pending" | "making" | "done" | "cancelled";

export const STATUS_LABELS_TH: Record<OrderStatus, string> = {
  pending: "สั่งซื้อ",
  making: "รับออเดอร์",
  done: "ชำระเงินแล้ว",
  cancelled: "ยกเลิก",
};

/**
 * LINE status command codes (!#<order-number> <code>) map 1:1 to the
 * fixed four statuses. Code 1 is reachable for completeness/lookup context
 * even though new orders already start at "pending".
 */
export const STATUS_CODE_MAP: Record<"1" | "2" | "3" | "4", OrderStatus> = {
  "1": "pending",
  "2": "making",
  "3": "done",
  "4": "cancelled",
};

export function isValidStatusCode(code: string): code is "1" | "2" | "3" | "4" {
  return code === "1" || code === "2" || code === "3" || code === "4";
}

export function statusFromCode(code: string): OrderStatus | null {
  return isValidStatusCode(code) ? STATUS_CODE_MAP[code] : null;
}

export function thaiLabelFor(status: OrderStatus): string {
  return STATUS_LABELS_TH[status];
}

// Reverse lookup: Thai status word -> status code. Used only for the
// reply-to-order-message feature, where a bare reply of "2" or "รับออเดอร์"
// (no "!" prefix) is accepted -- but only when it's confirmed to be a
// reply to a specific stored order message (see handleLineEvent.ts).
const THAI_LABEL_TO_CODE: Record<string, "1" | "2" | "3" | "4"> = {
  "สั่งซื้อ": "1",
  "รับออเดอร์": "2",
  "ชำระเงินแล้ว": "3",
  "ยกเลิก": "4",
};

/**
 * Parses a bare status reply -- either a digit "1"-"4" or one of the four
 * Thai status words, trimmed and NFC-normalized. Returns null for
 * anything else. Deliberately strict (exact match only, no partial/fuzzy
 * matching) since this is only ever invoked in the narrow, already-safe
 * context of a confirmed reply to a specific order message.
 */
export function parseBareStatusReply(rawText: string): "1" | "2" | "3" | "4" | null {
  const text = rawText.trim().normalize("NFC");
  if (isValidStatusCode(text)) return text;
  return THAI_LABEL_TO_CODE[text] ?? null;
}
