import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOrderNumber } from "@/lib/orders/generateOrderNumber";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";
import type { OrderRecord } from "@/lib/orders/getOrderByNumber";

export async function createOrder(
  supabase: SupabaseClient,
  params: {
    product: ProductRecord;
    quantity: number;
    customer: string;
    lineGroupId?: string | null;
  }
): Promise<OrderRecord> {
  const { orderNumber, businessDate } = await generateOrderNumber(supabase);

  const { data, error } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      business_date: businessDate,
      product_id: params.product.id,
      product_name_snapshot: params.product.name,
      quantity: params.quantity,
      selling_price_snapshot: params.product.selling_price,
      cost_price_snapshot: params.product.cost_price,
      customer_name: params.customer,
      source: "line",
      line_group_id: params.lineGroupId ?? null,
      status: "pending",
    })
    .select(
      "id, order_number, business_date, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, status"
    )
    .single();

  if (error) {
    throw new Error(`Failed to create order: ${error.message}`);
  }

  return data as OrderRecord;
}
