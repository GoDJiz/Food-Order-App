import type { SupabaseClient } from "@supabase/supabase-js";

const EXPIRY_MINUTES = 5;

export type PendingConfirmationMode = "confirm" | "select" | "create";

export interface PendingCandidate {
  id: string;
  name: string;
}

export interface PendingConfirmationRecord {
  id: string;
  line_group_id: string;
  line_user_id: string | null;
  mode: PendingConfirmationMode;
  raw_query: string;
  candidates: PendingCandidate[];
  quantity: number;
  customer_name: string;
  expires_at: string;
}

/**
 * Fetches the active (non-expired) pending confirmation for this scope, if
 * any. Scoped by (line_group_id, line_user_id) -- when line_user_id is
 * null (LINE didn't provide one), this falls back to a group-level scope,
 * so a row created with userId=null only ever matches other userId=null
 * lookups in the same group, never a specific user's row and vice versa.
 *
 * An expired row is treated as "none" and lazily deleted here, so callers
 * never need to think about expiry themselves.
 */
export async function getActivePendingConfirmation(
  supabase: SupabaseClient,
  groupId: string,
  userId: string | null,
  now: Date = new Date()
): Promise<PendingConfirmationRecord | null> {
  let query = supabase.from("pending_product_confirmations").select("*").eq("line_group_id", groupId);
  query = userId === null ? query.is("line_user_id", null) : query.eq("line_user_id", userId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to load pending confirmation: ${error.message}`);
  }

  if (!data) return null;

  const record = data as PendingConfirmationRecord;
  const expired = new Date(record.expires_at).getTime() <= now.getTime();

  if (expired) {
    // Lazy cleanup -- best-effort, don't fail the caller's request over it.
    await supabase.from("pending_product_confirmations").delete().eq("id", record.id);
    return null;
  }

  return record;
}

/**
 * Creates a new pending confirmation, replacing any existing one for the
 * same (group, user) scope -- this is what guarantees at most one active
 * pending request per (group, user) without needing a DB constraint that
 * would have to account for expiry.
 */
export async function createPendingConfirmation(
  supabase: SupabaseClient,
  params: {
    groupId: string;
    userId: string | null;
    mode: PendingConfirmationMode;
    rawQuery: string;
    candidates: PendingCandidate[];
    quantity: number;
    customerName: string;
  },
  now: Date = new Date()
): Promise<void> {
  let deleteQuery = supabase
    .from("pending_product_confirmations")
    .delete()
    .eq("line_group_id", params.groupId);
  deleteQuery =
    params.userId === null ? deleteQuery.is("line_user_id", null) : deleteQuery.eq("line_user_id", params.userId);
  await deleteQuery;

  const expiresAt = new Date(now.getTime() + EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from("pending_product_confirmations").insert({
    line_group_id: params.groupId,
    line_user_id: params.userId,
    mode: params.mode,
    raw_query: params.rawQuery,
    candidates: params.candidates,
    quantity: params.quantity,
    customer_name: params.customerName,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create pending confirmation: ${error.message}`);
  }
}

/**
 * Deletes a pending confirmation immediately after it has been
 * successfully resolved (yes / selected / created) -- consumed exactly
 * once, per the approved design.
 */
export async function consumePendingConfirmation(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("pending_product_confirmations").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to consume pending confirmation: ${error.message}`);
  }
}
