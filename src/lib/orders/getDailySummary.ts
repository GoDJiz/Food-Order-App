import type { SupabaseClient } from "@supabase/supabase-js";
import { currentBusinessDate } from "@/lib/date";
import type { DailySummaryInput, DailySummaryLine } from "@/lib/line/buildReplyText";

/**
 * Aggregates today's (Asia/Bangkok business_date) orders into the shape
 * needed for the short LINE !summary reply. Excludes cancelled orders from
 * totals, since a cancelled order isn't real business.
 */
export async function getDailySummary(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DailySummaryInput> {
  const businessDate = currentBusinessDate(now);

  const { data, error } = await supabase
    .from("orders")
    .select("product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, status")
    .eq("business_date", businessDate)
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`Failed to load daily summary: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    product_name_snapshot: string;
    quantity: number;
    selling_price_snapshot: number;
    cost_price_snapshot: number;
  }>;

  const byProduct = new Map<string, number>();
  let totalItems = 0;
  let totalSales = 0;
  let totalCost = 0;

  for (const row of rows) {
    byProduct.set(row.product_name_snapshot, (byProduct.get(row.product_name_snapshot) ?? 0) + row.quantity);
    totalItems += row.quantity;
    totalSales += row.selling_price_snapshot * row.quantity;
    totalCost += row.cost_price_snapshot * row.quantity;
  }

  const lines: DailySummaryLine[] = Array.from(byProduct.entries()).map(([productName, quantity]) => ({
    productName,
    quantity,
    unit: "",
  }));

  return {
    lines,
    totalOrders: rows.length,
    totalItems,
    totalSales,
    totalProfit: totalSales - totalCost,
  };
}
