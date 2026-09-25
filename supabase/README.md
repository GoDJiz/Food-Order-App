# Supabase Setup

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is enough for this app).
2. Click **New project**.
3. Choose an organization, name the project (e.g. `food-order-app`), set a database password (save it somewhere safe — you won't need it day-to-day, but keep it), and pick a region close to your users (e.g. Singapore for Thailand-based orders, for lower latency).
4. Wait for the project to finish provisioning (a couple of minutes).

## 2. Run the migration

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/migrations/0001_init.sql` from this repository, copy its entire contents, and paste it into the SQL editor.
4. Click **Run**.
5. You should see "Success. No rows returned." If you see an error, read it carefully — the most common cause is running the migration twice (tables already exist). If you need to start over on a fresh project, that's the simplest fix.

## 3. Required settings

- No special project settings are required beyond the default free-tier configuration.
- You do **not** need to enable Supabase Auth, Storage, or Realtime for this app — none of those are used.
- Row Level Security (RLS) is enabled on every table by the migration itself; you don't need to toggle anything manually.

## 4. How RLS / service-role access works here

- Every table (`products`, `orders`, `line_events`, `order_number_counters`) has RLS **enabled**, but the migration does not create any RLS policies for the `anon` or `authenticated` roles.
- This means: with RLS enabled and no policies, the anon/public API key **cannot read or write these tables at all** — which is intentional and secure by default.
- The application never uses the anon key to touch these tables. Instead, all reads/writes go through the app's own server-side API routes (Vercel), which use the **service role key** — a key that bypasses RLS by design and must only ever be used on the server.
- The service role key is stored only in Vercel's environment variables (server-side) and is never sent to the browser. See the Security section in the main README for more detail.
- **Practical implication:** if you ever add a new table, remember RLS is on by default in this project's philosophy — don't add anon/public policies unless you have a specific reason to let the browser talk to Supabase directly (this app doesn't).

## 5. Verifying the migration applied correctly

After running the migration, verify it in the Supabase dashboard:

### Tables (Table Editor → should see all 4)
- `products` — columns: `id, name, unit, selling_price, cost_price, active, created_at, updated_at`
- `orders` — columns include `order_number, business_date, product_id, product_name_snapshot, quantity, selling_price_snapshot, cost_price_snapshot, customer_name, source, line_group_id, status, ordered_at, created_at`
- `line_events` — columns: `id, event_id, event_type, raw_payload, created_at`
- `order_number_counters` — columns: `business_date, last_seq`

### Indexes / constraints (SQL Editor → run this query to check)
```sql
select indexname, tablename from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```
You should see (among others): `products_name_unique_ci`, `orders_order_number_unique`, `orders_business_date_idx`, `orders_status_idx`, `line_events_event_id_key`.

### Enums
```sql
select typname, enumlabel from pg_enum
join pg_type on pg_type.oid = pg_enum.enumtypid
where typname in ('order_status', 'order_source')
order by typname, enumsortorder;
```
Expected `order_status` values: `pending, making, done, cancelled`.
Expected `order_source` values: `line, manual`.

### The order-number RPC function
```sql
select routine_name from information_schema.routines
where routine_name = 'next_order_seq';
```
Should return one row. You can also test it directly (safe to run — it will consume a real sequence number for today's date, so only do this before going live, or note the number it returns):
```sql
select next_order_seq(current_date);
```

### RLS is enabled
```sql
select relname, relrowsecurity from pg_class
where relname in ('products', 'orders', 'line_events', 'order_number_counters');
```
All four should show `relrowsecurity = true`.

## 6. Getting the keys you'll need for Vercel

In the Supabase dashboard: **Project Settings → API**.
- `NEXT_PUBLIC_SUPABASE_URL` = the "Project URL" field.
- `SUPABASE_SERVICE_ROLE_KEY` = the "service_role" secret key (**not** the "anon" key). Treat this like a password — never commit it, never put it in client-side code.

## 7. Free-tier limitations to be aware of

- Supabase's free tier includes a limited database size and a limited number of concurrent connections, and free projects can be automatically paused after a period of inactivity (you can manually resume a paused project from the dashboard).
- These limits are generous for a small food-order operation, but if your order volume grows significantly, check Supabase's current pricing page for up-to-date limits before you rely on this in a busy season.
