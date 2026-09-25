import type { SupabaseClient } from "@supabase/supabase-js";
import { currentBusinessDate } from "@/lib/date";
import { getReportByDate } from "@/lib/orders/getReportByDate";

export interface ToMakeLine {
  productName: string;
  quantity: number;
}

export interface TodaySummary {
  businessDate: string;
  orders: number;
  items: number;
  sales: number;
  cost: number;
  profit: number;
  toMake: ToMakeLine[];
}

/**
 * Powers the Today dashboard: order/item counts, sales/cost/profit
 * (excluding cancelled orders), and a "still to make" breakdown covering
 * orders that are pending or making (not yet done, not cancelled).
 */
export async function getTodaySummary(supabase: SupabaseClient): Promise<TodaySummary> {
  const businessDate = currentBusinessDate();
  const report = await getReportByDate(supabase, businessDate);

  const { data, error } = await supabase
    .from("orders")
    .select("product_name_snapshot, quantity, status")
    .eq("business_date", businessDate)
    .in("status", ["pending", "making"]);

  if (error) throw new Error(`Failed to load to-make list: ${error.message}`);

  const rows = (data ?? []) as Array<{ product_name_snapshot: string; quantity: number }>;
  const byProduct = new Map<string, number>();
  for (const row of rows) {
    byProduct.set(row.product_name_snapshot, (byProduct.get(row.product_name_snapshot) ?? 0) + row.quantity);
  }

  const toMake: ToMakeLine[] = Array.from(byProduct.entries())
    .map(([productName, quantity]) => ({ productName, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  // Order count = distinct non-cancelled order rows for the day.
  const ordersCount = await countOrders(supabase, businessDate);

  return {
    businessDate,
    orders: ordersCount,
    items: report.totals.quantity,
    sales: report.totals.revenue,
    cost: report.totals.cost,
    profit: report.totals.profit,
    toMake,
  };
}

async function countOrders(supabase: SupabaseClient, businessDate: string): Promise<number> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("business_date", businessDate)
    .neq("status", "cancelled");

  if (error) throw new Error(`Failed to count orders: ${error.message}`);
  return count ?? 0;
}
