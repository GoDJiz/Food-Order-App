import type { SupabaseClient } from "@supabase/supabase-js";
import { currentBusinessDate, formatOrderNumber } from "@/lib/date";

/**
 * Atomically assigns the next order number for the current Asia/Bangkok
 * business date. Uses a single upsert with a Postgres RPC so the
 * increment-and-return is one atomic statement — safe against two webhook
 * requests landing at the same instant. Requires the `next_order_seq`
 * SQL function (see supabase/migrations/0001_init.sql companion RPC below).
 */
export async function generateOrderNumber(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<{ orderNumber: string; businessDate: string }> {
  const businessDate = currentBusinessDate(now);

  const { data, error } = await supabase.rpc("next_order_seq", {
    p_business_date: businessDate,
  });

  if (error) {
    throw new Error(`Failed to generate order number: ${error.message}`);
  }

  const seq = data as number;
  const orderNumber = formatOrderNumber(businessDate, seq);

  return { orderNumber, businessDate };
}
