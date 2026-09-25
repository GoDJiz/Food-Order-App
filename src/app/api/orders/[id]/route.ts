import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateOrderStatusById } from "@/lib/orders/updateOrderStatus";
import { isValidOrderStatus } from "@/lib/orders/listOrders";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const status = body.status ?? "";
  if (!isValidOrderStatus(status)) {
    return NextResponse.json(
      { error: "Status must be one of: pending, making, done, cancelled" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  try {
    const order = await updateOrderStatusById(supabase, id, status);
    return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
