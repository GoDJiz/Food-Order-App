import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTodaySummary } from "@/lib/orders/getTodaySummary";

// Today's numbers must never be served stale — a just-placed order has to
// show up immediately.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServerClient();

  try {
    const summary = await getTodaySummary(supabase);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
