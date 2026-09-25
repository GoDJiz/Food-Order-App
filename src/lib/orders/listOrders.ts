import type { SupabaseClient } from "@supabase/supabase-js";
import { currentBusinessDate } from "@/lib/date";
import type { OrderStatus } from "@/lib/orders/status";

export interface OrderListItem {
  id: string;
  order_number: string;
  business_date: string;
  product_name_snapshot: string;
  quantity: number;
  selling_price_snapshot: number;
  cost_price_snapshot: number;
  customer_name: string;
  status: OrderStatus;
  ordered_at: string;
}

/**
 * Lists orders for a given business date (defaults to today, Asia/Bangkok).
 * Used by the Orders page and the Today page's "To Make" list.
 */
export async function listOrders(
  supabase: SupabaseClient,
  opts: { businessDate?: string } = {}
): Promise<OrderListItem[]> {
  const businessDate = opts.businessDate ?? currentBusinessDate();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, business_date, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, status, ordered_at"
    )
    .eq("business_date", businessDate)
    .order("ordered_at", { ascending: true });

  if (error) throw new Error(`Failed to list orders: ${error.message}`);
  return (data as OrderListItem[]) ?? [];
}

const VALID_STATUSES: OrderStatus[] = ["pending", "making", "done", "cancelled"];

export function isValidOrderStatus(value: string): value is OrderStatus {
  return (VALID_STATUSES as string[]).includes(value);
}
