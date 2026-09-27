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

  // Orders don't snapshot a unit (only price/cost are snapshotted), so this
  // is a best-effort, live lookup against the CURRENT product catalog for
  // display purposes only -- purely cosmetic (e.g. "5 ขวด" instead of just
  // "5"), never used for any calculation. If a product's unit changed
  // since some of today's orders were placed, or the product was removed
  // entirely, the line still shows correctly, just without a unit suffix.
  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select("name, unit");

  if (productError) {
    throw new Error(`Failed to load product units for daily summary: ${productError.message}`);
  }

  const unitByProductName = new Map<string, string>();
  for (const p of (productRows ?? []) as Array<{ name: string; unit: string }>) {
    unitByProductName.set(p.name, p.unit ?? "");
  }

  const lines: DailySummaryLine[] = Array.from(byProduct.entries()).map(([productName, quantity]) => ({
    productName,
    quantity,
    unit: unitByProductName.get(productName) ?? "",
  }));

  return {
    lines,
    totalOrders: rows.length,
    totalItems,
    totalSales,
    totalProfit: totalSales - totalCost,
  };
}
