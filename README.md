# Food Order App

A simple, mobile-first order management app for a small food business taking orders through a LINE group. Staff place orders by typing a short command in LINE; the app parses it, stores it, and gives the shop a dashboard to track today's orders, production, and profit.

> "Order in LINE as quickly as possible, and understand today's business at a glance."

## What it does

- **Takes orders from a LINE group** via a simple `!product quantity customer` command.
- **Assigns each order a sequential daily order number** (`#YYMMDD-0001`), safe even if two orders arrive at the same instant.
- **Supports status lookups and changes directly from LINE** (`!#260916-0001`, `!#260916-0001 2`) as well as from the dashboard.
- **Shows a live "Today" dashboard**: orders, items, sales, cost, profit, and what's still left to make.
- **Tracks historical reports** by date, with revenue/cost/profit calculated from the price that was in effect *when the order was placed* — changing a product's price later never rewrites history.
- **Protects the dashboard** with a single shared PIN (no user accounts, no roles).

## Tech stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres) for the database
- **Vercel** for hosting
- **LINE Messaging API** for the ordering channel
- **GitHub** for source control / CI-free deployment via Vercel's Git integration

## Getting started (for developers)

```bash
npm install
cp .env.example .env.local   # fill in real values — see below
npm run dev                  # local dev server
npm run test                 # run the test suite
npm run typecheck            # TypeScript check
npm run build                # production build
```

For the full non-developer setup walkthrough (accounts, Supabase, LINE, Vercel, PIN), see **`INSTALLATION.md`**.

## Environment variables

See `.env.example` for the full list. In short:

| Variable | Purpose | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes (safe — it's just a URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Full-access Supabase key, server-only | **Never** |
| `LINE_CHANNEL_SECRET` | Verifies LINE webhook signatures | **Never** |
| `LINE_CHANNEL_ACCESS_TOKEN` | Sends replies via the LINE Reply API | **Never** |
| `DASHBOARD_PIN_HASH` | bcrypt hash of the staff PIN (plaintext PIN is never stored anywhere) | **Never** |
| `SESSION_SECRET` | Signs the dashboard session cookie | **Never** |

Only `NEXT_PUBLIC_SUPABASE_URL` is intentionally public (it's a project URL, not a credential — Supabase access is controlled by RLS + the fact that the anon key is never even used by this app). Every other secret is read only in server-side code (API routes, middleware) and is never bundled into client-side JavaScript.

## Architecture

```
LINE Group
   ↓  (user sends "!Orange Juice 1 P'Kai")
LINE Messaging API
   ↓  webhook POST, signed
Vercel API Route: /api/line/webhook
   ↓  verify signature → dedupe → parse → read/write
Supabase (Postgres)
   ├─ products
   ├─ orders            (price/cost snapshotted at order time)
   ├─ line_events        (idempotency)
   └─ order_number_counters (atomic daily order numbers)
   ↑
Vercel API Routes (/api/orders, /api/products, /api/summary, /api/reports)
   ↑
Next.js Dashboard (mobile-first: Today / Orders / Products / Reports / Settings)
```

## Caching strategy

This app follows one rule: **anything showing "today" or "right now" must never be stale; anything about a closed, historical date is safe to cache.**

| Route | Cache behavior | Why |
|---|---|---|
| `/api/line/webhook` | `force-dynamic`, no caching | Always live processing of incoming orders. |
| `/api/orders` (today's orders) | `Cache-Control: no-store` | Staff must see a just-placed order immediately. |
| `/api/orders/[id]` (status change) | `Cache-Control: no-store` | Status changes must take effect immediately. |
| `/api/summary` (Today dashboard) | `Cache-Control: no-store` | Same reasoning — always live. |
| `/api/reports?date=<today>` | `Cache-Control: no-store` | Today's report is still changing throughout the day. |
| `/api/reports?date=<past date>` | `Cache-Control: private, max-age=3600` | A closed day's numbers cannot change — 1 hour of caching is safe and speeds up repeat views. |
| `/api/products` (GET, list) | `revalidate: 30` (30s) | Products change rarely; a 30-second lag is imperceptible and reduces load on the product dropdown/list. |
| `/api/products` (POST/PATCH, writes) | `Cache-Control: no-store` | Writes are never cached. |

**Rule of thumb used throughout:** if a route can show something that just changed and the person needs to act on it (an order, its status, today's running totals), it is `no-store`. If a route only ever shows something that is either slow-changing (the product catalog) or permanently closed (a past date's report), it is allowed to cache.

## Scope

This app intentionally does **not** include: inventory management, delivery, payment processing, accounting, OCR, AI features, promotions, payroll, multi-company support, complex roles/permissions, or any notification system beyond the approved LINE order workflow. If a feature isn't listed in the Features section above, it was deliberately left out to keep the app simple, low-cost, and easy to maintain.

## Documentation index

- **`INSTALLATION.md`** — full non-developer setup guide (accounts → Supabase → LINE → Vercel → PIN → first order)
- **`supabase/README.md`** — Supabase project creation, migration, and verification steps
- **`SMOKE_TEST_CHECKLIST.md`** — a concise pre-launch / post-deploy verification checklist
- **`.env.example`** — full list of required environment variables
