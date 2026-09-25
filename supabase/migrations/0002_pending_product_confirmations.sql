-- Pending product-confirmation state for the LINE "similar product" flow.
-- Vercel functions are stateless/serverless, so this state must be
-- persisted in Supabase rather than kept in memory between webhook calls.
--
-- At most one active row exists per (line_group_id, line_user_id) pair at
-- any time -- enforced at the application level (the row is deleted and
-- replaced on each new pending confirmation), not via a DB constraint,
-- since a simple uniqueness constraint can't distinguish "expired" from
-- "active" without a partial index tied to wall-clock time.
create table pending_product_confirmations (
  id uuid primary key default gen_random_uuid(),
  line_group_id text not null,
  line_user_id text, -- nullable: LINE does not always provide a userId in a group's message source
  mode text not null check (mode in ('confirm', 'select', 'create')),
  raw_query text not null, -- the originally-typed, unmatched product text
  candidates jsonb not null default '[]'::jsonb, -- array of {id, name} snapshots at proposal time
  quantity integer not null,
  customer_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index pending_product_confirmations_scope_idx
  on pending_product_confirmations (line_group_id, line_user_id);

alter table pending_product_confirmations enable row level security;
-- No anon/public policies, matching every other table in this project:
-- access is only through server-side API routes using the service role key.
