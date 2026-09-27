import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/orders/status";

export interface OrderRecord {
  id: string;
  order_number: string;
  business_date: string;
  product_name_snapshot: string;
  quantity: number;
  selling_price_snapshot: number;
  cost_price_snapshot: number;
  customer_name: string;
  status: OrderStatus;
  unit?: string | null;
}

export async function getOrderByNumber(
  supabase: SupabaseClient,
  orderNumber: string
): Promise<OrderRecord | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, business_date, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, status"
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up order ${orderNumber}: ${error.message}`);
  }

  return (data as OrderRecord) ?? null;
}

/**
 * Looks up an order by the LINE message id of the most recent bot message
 * that displayed it -- used only for the "reply to this order message"
 * feature. Returns null if no order's last_line_message_id matches, which
 * is the normal, expected outcome for a reply to any unrelated message.
 */
export async function getOrderByLastMessageId(
  supabase: SupabaseClient,
  messageId: string
): Promise<OrderRecord | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, business_date, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, status"
    )
    .eq("last_line_message_id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up order by LINE message id: ${error.message}`);
  }

  return (data as OrderRecord) ?? null;
}
