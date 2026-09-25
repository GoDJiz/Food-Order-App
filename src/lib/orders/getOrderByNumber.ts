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
