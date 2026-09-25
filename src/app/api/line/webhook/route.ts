import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { verifyLineSignature } from "@/lib/line/verifySignature";
import { handleEvent, type LineEvent } from "@/lib/line/handleLineEvent";

// This route must never be cached — always live processing.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !channelAccessToken) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { events?: LineEvent[] };
  const events = payload.events ?? [];
  const supabase = getSupabaseServerClient();

  for (const event of events) {
    await handleEvent(event, supabase, channelAccessToken).catch((err) => {
      // Never let one bad event break the whole batch / webhook response.
      console.error("Error handling LINE event", event.webhookEventId, err);
    });
  }

  // Always 200 quickly, regardless of per-event outcome — LINE retries on
  // non-200, and our line_events dedup absorbs any resulting retries.
  return NextResponse.json({ ok: true });
}
