import type { SupabaseClient } from "@supabase/supabase-js";
import { currentBusinessDate } from "@/lib/date";

export interface ReportLine {
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface ReportResult {
  businessDate: string;
  lines: ReportLine[];
  totals: { quantity: number; revenue: number; cost: number; profit: number };
  isToday: boolean;
}

/**
 * Cancelled orders are excluded from revenue/cost/profit reporting — they
 * never became real business. All money figures use the snapshot columns,
 * so this report is unaffected by later product price changes.
 */
export async function getReportByDate(
  supabase: SupabaseClient,
  businessDate?: string
): Promise<ReportResult> {
  const date = businessDate ?? currentBusinessDate();

  const { data, error } = await supabase
    .from("orders")
    .select("product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, status")
    .eq("business_date", date)
    .neq("status", "cancelled");

  if (error) throw new Error(`Failed to load report for ${date}: ${error.message}`);

  const rows = (data ?? []) as Array<{
    product_name_snapshot: string;
    quantity: number;
    selling_price_snapshot: number;
    cost_price_snapshot: number;
  }>;

  const byProduct = new Map<string, ReportLine>();

  for (const row of rows) {
    const revenue = row.selling_price_snapshot * row.quantity;
    const cost = row.cost_price_snapshot * row.quantity;
    const existing = byProduct.get(row.product_name_snapshot);
    if (existing) {
      existing.quantity += row.quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += revenue - cost;
    } else {
      byProduct.set(row.product_name_snapshot, {
        productName: row.product_name_snapshot,
        quantity: row.quantity,
        revenue,
        cost,
        profit: revenue - cost,
      });
    }
  }

  const lines = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);

  const totals = lines.reduce(
    (acc, l) => ({
      quantity: acc.quantity + l.quantity,
      revenue: acc.revenue + l.revenue,
      cost: acc.cost + l.cost,
      profit: acc.profit + l.profit,
    }),
    { quantity: 0, revenue: 0, cost: 0, profit: 0 }
  );

  return { businessDate: date, lines, totals, isToday: date === currentBusinessDate() };
}
