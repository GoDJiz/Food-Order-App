import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listOrders } from "@/lib/orders/listOrders";

// "Today" (and any selected date) order data must never be served stale.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const businessDate = req.nextUrl.searchParams.get("date") ?? undefined;
  const supabase = getSupabaseServerClient();

  try {
    const orders = await listOrders(supabase, { businessDate });
    return NextResponse.json(
      { orders },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
