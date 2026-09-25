import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductRecord } from "@/lib/orders/getActiveProductByName";

export interface ProductInput {
  name: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  active: boolean;
}

export function validateProductInput(input: Partial<ProductInput>): string | null {
  if (!input.name || !input.name.trim()) return "Product name is required.";
  if (input.selling_price === undefined || input.selling_price < 0)
    return "Selling price must be zero or greater.";
  if (input.cost_price === undefined || input.cost_price < 0)
    return "Cost price must be zero or greater.";
  return null;
}

export async function listProducts(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {}
): Promise<ProductRecord[]> {
  let query = supabase
    .from("products")
    .select("id, name, unit, selling_price, cost_price, active")
    .order("name", { ascending: true });

  if (!opts.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list products: ${error.message}`);
  return (data as ProductRecord[]) ?? [];
}

export async function createProduct(
  supabase: SupabaseClient,
  input: ProductInput
): Promise<ProductRecord> {
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name.trim(),
      unit: input.unit?.trim() ?? "",
      selling_price: input.selling_price,
      cost_price: input.cost_price,
      active: input.active,
    })
    .select("id, name, unit, selling_price, cost_price, active")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("A product with this name already exists.");
    throw new Error(`Failed to create product: ${error.message}`);
  }

  return data as ProductRecord;
}

export async function updateProduct(
  supabase: SupabaseClient,
  id: string,
  input: Partial<ProductInput>
): Promise<ProductRecord> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.unit !== undefined) patch.unit = input.unit.trim();
  if (input.selling_price !== undefined) patch.selling_price = input.selling_price;
  if (input.cost_price !== undefined) patch.cost_price = input.cost_price;
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("id, name, unit, selling_price, cost_price, active")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") throw new Error("A product with this name already exists.");
    throw new Error(`Failed to update product: ${error.message}`);
  }
  if (!data) throw new Error("Product not found.");

  return data as ProductRecord;
}
