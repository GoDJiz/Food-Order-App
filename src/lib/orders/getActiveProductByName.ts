import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProductRecord {
  id: string;
  name: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  active: boolean;
}

export async function getActiveProductByName(
  supabase: SupabaseClient,
  name: string
): Promise<ProductRecord | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, unit, selling_price, cost_price, active")
    .ilike("name", name)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up product "${name}": ${error.message}`);
  }

  return (data as ProductRecord) ?? null;
}
