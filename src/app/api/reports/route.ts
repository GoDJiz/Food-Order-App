import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getReportByDate } from "@/lib/orders/getReportByDate";

export const dynamic = "force-dynamic"; // decision on caching is made per-response below

export async function GET(req: NextRequest) {
  const requestedDate = req.nextUrl.searchParams.get("date") ?? undefined;
  const supabase = getSupabaseServerClient();

  try {
    const report = await getReportByDate(supabase, requestedDate);

    // Only today's report must stay fresh; a past (closed) date's report
    // cannot change, so it's safe to let it be cached longer client-side.
    const cacheControl = report.isToday
      ? "no-store"
      : "private, max-age=3600";

    return NextResponse.json({ report }, { headers: { "Cache-Control": cacheControl } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
