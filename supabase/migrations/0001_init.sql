-- =========================================
-- EXTENSIONS
-- =========================================
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- =========================================
-- PRODUCTS
-- =========================================
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default '',           -- e.g. "cup", "bottle"
  selling_price numeric(10,2) not null check (selling_price >= 0),
  cost_price numeric(10,2) not null check (cost_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- case-insensitive uniqueness so "Orange Juice" and "orange juice" don't collide
create unique index products_name_unique_ci on products (lower(name));
create index products_active_idx on products (active);

-- =========================================
-- ORDER NUMBER COUNTERS (Phase 3)
-- One row per Asia/Bangkok business date. Used to atomically generate
-- sequential order numbers safe under concurrent webhook requests.
-- =========================================
create table order_number_counters (
  business_date date primary key,
  last_seq integer not null default 0
);

-- Atomically increments (or creates) the counter for a business date and
-- returns the new sequence number, in a single statement. This is what
-- makes order-number generation safe under concurrent webhook requests:
-- Postgres serializes the upsert per row, so two simultaneous calls for
-- the same business_date can never receive the same seq value.
create or replace function next_order_seq(p_business_date date)
returns integer
language sql
as $$
  insert into order_number_counters (business_date, last_seq)
  values (p_business_date, 1)
  on conflict (business_date)
  do update set last_seq = order_number_counters.last_seq + 1
  returning last_seq;
$$;

-- =========================================
-- ORDERS
-- =========================================
create type order_status as enum ('pending', 'making', 'done', 'cancelled');
create type order_source as enum ('line', 'manual');

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,                       -- e.g. "#260916-0001" (Phase 3)
  business_date date not null,                       -- Asia/Bangkok date used for numbering + "today" filters (Phase 3)
  product_id uuid references products(id),           -- nullable: product may be deleted later, snapshot survives
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  selling_price_snapshot numeric(10,2) not null,
  cost_price_snapshot numeric(10,2) not null,
  customer_name text not null,
  source order_source not null default 'line',
  line_group_id text,
  status order_status not null default 'pending',
  ordered_at timestamptz not null default now(),     -- business date/time of the order
  created_at timestamptz not null default now()
);

create unique index orders_order_number_unique on orders (order_number);
create index orders_business_date_idx on orders (business_date);
create index orders_ordered_at_idx on orders (ordered_at);
create index orders_status_idx on orders (status);
create index orders_product_id_idx on orders (product_id);

-- =========================================
-- LINE EVENTS (idempotency / audit)
-- =========================================
create table line_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,     -- LINE's webhookEventId
  event_type text not null,          -- e.g. "message", "summary_command", "status_command"
  raw_payload jsonb,                 -- optional: store for debugging
  created_at timestamptz not null default now()
);

-- =========================================
-- updated_at trigger for products
-- =========================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

-- =========================================
-- RLS
-- =========================================
alter table products enable row level security;
alter table orders enable row level security;
alter table line_events enable row level security;
alter table order_number_counters enable row level security;

-- No public/anon policies are created. All access goes through the
-- Vercel API routes using the Supabase SERVICE ROLE key (server-side only),
-- which bypasses RLS. The anon/public key is never used to touch these
-- tables directly from the browser.
