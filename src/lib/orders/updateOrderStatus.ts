import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderRecord } from "@/lib/orders/getOrderByNumber";
import type { OrderStatus } from "@/lib/orders/status";

/**
 * Updates ONLY the `status` column for the given order. Product, customer,
 * quantity, and all price snapshots are never touched by this function,
 * per the requirement that status changes must not alter historical order
 * data.
 */
export async function updateOrderStatus(
  supabase: SupabaseClient,
  orderNumber: string,
  newStatus: OrderStatus
): Promise<OrderRecord> {
  const { data, error } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("order_number", orderNumber)
    .select(
      "id, order_number, business_date, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, status"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update status for order ${orderNumber}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Order ${orderNumber} not found during status update.`);
  }

  return data as OrderRecord;
}

/**
 * Dashboard variant: updates status by primary key (id) instead of order
 * number, since the Orders page works with the row id. Same guarantee:
 * only `status` is written, everything else is preserved untouched.
 */
export async function updateOrderStatusById(
  supabase: SupabaseClient,
  id: string,
  newStatus: OrderStatus
): Promise<OrderRecord> {
  const { data, error } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", id)
    .select(
      "id, order_number, business_date, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, status"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update status for order ${id}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Order ${id} not found during status update.`);
  }

  return data as OrderRecord;
}

/**
 * Records the LINE message id of the most recent bot message that
 * displayed this order's full state. Used only to support "reply to this
 * order message" -- never touches any business column (product, customer,
 * quantity, prices, status). Best-effort: a failure here should not break
 * the reply that was already sent to the user, so callers should treat
 * this as non-critical (log and continue rather than surface an error).
 */
export async function setOrderLastMessageId(
  supabase: SupabaseClient,
  orderId: string,
  messageId: string
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ last_line_message_id: messageId })
    .eq("id", orderId);

  if (error) {
    throw new Error(`Failed to record LINE message id for order ${orderId}: ${error.message}`);
  }
}
