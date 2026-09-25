import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateProduct, validateProductInput, type ProductInput } from "@/lib/products/products";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Partial<ProductInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Only validate fields that were actually supplied — this route supports
  // partial updates (e.g. just toggling `active`).
  const validationError = validateProductInput({
    name: body.name ?? "placeholder",
    selling_price: body.selling_price ?? 0,
    cost_price: body.cost_price ?? 0,
    ...body,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  try {
    const product = await updateProduct(supabase, id, body);
    return NextResponse.json({ product }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
