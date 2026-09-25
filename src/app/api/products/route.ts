import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listProducts, createProduct, validateProductInput } from "@/lib/products/products";

// Product list changes infrequently; a short cache is fine and documented
// in the caching strategy (30s is imperceptible for a rarely-changed list).
export const revalidate = 30;

export async function GET(req: NextRequest) {
  const includeInactive = req.nextUrl.searchParams.get("all") === "true";
  const supabase = getSupabaseServerClient();

  try {
    const products = await listProducts(supabase, { includeInactive });
    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<{ name: string; unit: string; selling_price: number; cost_price: number; active: boolean }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  try {
    const product = await createProduct(supabase, {
      name: body.name!.trim(),
      unit: body.unit ?? "",
      selling_price: body.selling_price!,
      cost_price: body.cost_price!,
      active: body.active ?? true,
    });
    return NextResponse.json({ product }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
