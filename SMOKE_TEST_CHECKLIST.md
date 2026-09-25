# Production Smoke Test Checklist

Run through this after every deploy (and especially the first one) to confirm the live system actually works end-to-end. Each item should take seconds to a couple of minutes.

## Dashboard auth
- [ ] Visiting the site while logged out redirects to `/login`.
- [ ] Logging in with the correct PIN succeeds and lands on `/today`.
- [ ] Logging in with an **incorrect** PIN shows an error and does not log in.
- [ ] Logging out clears the session — reloading any dashboard page redirects back to `/login`.
- [ ] Login and logout both work on a phone browser, not just desktop.

## LINE webhook security
- [ ] A request to `/api/line/webhook` with a missing/invalid `X-Line-Signature` header is rejected (401), not processed.
- [ ] The LINE Developers Console's **Verify** button on the webhook settings succeeds.

## New order flow
- [ ] Sending `!<product> <qty> <customer>` in the LINE group for an existing **active** product creates an order and the bot replies with the full order summary (order number, product, quantity + unit, customer, status สั่งซื้อ).
- [ ] The new order appears on the **Today** and **Orders** dashboard pages without needing to hard-refresh (or refreshes correctly within ~15s / on manual refresh).
- [ ] Order numbers follow `#YYMMDD-0001` and increment correctly for each new order that day.
- [ ] Sending an order for a product name that doesn't exist (or is inactive) gets a clear "product not found" reply, and no order is created.
- [ ] Sending a malformed message (`!Orange Juice`, `!Orange Juice abc P'Kai`, `!Orange Juice -1 P'Kai`) gets the invalid-format reply, and no order is created.

## Order lookup and status changes
- [ ] `!#<order-number>` (no status digit) returns the current order summary and does **not** change its status.
- [ ] `!#<order-number> 2` changes status to รับออเดอร์ and the reply reflects it.
- [ ] `!#<order-number> 3` changes status to ชำระเงินแล้ว.
- [ ] `!#<order-number> 4` changes status to ยกเลิก.
- [ ] An invalid status digit (e.g. `9`) is rejected with a clear error, and the order's status is unchanged.
- [ ] A nonexistent order number gets a clear "not found" reply.
- [ ] Changing status from LINE is reflected on the **Orders** dashboard page, and vice versa (dashboard status change is reflected if you look the order up in LINE afterward).

## Duplicate events
- [ ] If LINE retries a webhook delivery (simulated by resending the same event, or naturally observed under real network conditions), the order is **not** created/updated twice, and only one reply is sent.

## Summary command
- [ ] `!summary` in the LINE group returns a short summary (per-product quantities + totals: order count, item count, sales, profit) matching what the Today dashboard shows for the same date.

## Products
- [ ] Creating a new product from the Products page works and it appears in the list.
- [ ] Editing a product's price/unit/name saves correctly.
- [ ] Deactivating a product removes it from the active product list (and from what LINE will accept as a valid order), without deleting historical orders that reference it.
- [ ] Reactivating a product makes it orderable again.
- [ ] Creating a duplicate product name (case-insensitive) is rejected with a clear error.

## Today dashboard
- [ ] Numbers (orders, items, sales, cost, profit) match what you'd expect from the orders placed today.
- [ ] The "To Make" list correctly reflects only orders that are pending or making (not done, not cancelled).
- [ ] Placing a new test order updates these numbers without a manual page reload (within the polling interval) or on refresh.

## Historical reports
- [ ] Selecting a past date on the Reports page shows the correct per-product quantity/revenue/cost/profit breakdown for that date.
- [ ] Cancelled orders are excluded from revenue/cost/profit totals.

## Snapshot price independence
- [ ] Place a test order for a product, note its revenue/cost in a report for that day.
- [ ] Change that product's selling price and/or cost price in the Products page.
- [ ] Reload the report for the earlier date — the revenue/cost/profit figures must be **unchanged**, still reflecting the price at the time the order was placed.

## Mobile layout
- [ ] All five dashboard pages (Today, Orders, Products, Reports, Settings) are usable on a phone-sized screen — no horizontal scrolling, buttons/inputs are tappable, bottom navigation is visible and works.
- [ ] The same pages also look correct on a tablet and desktop browser window.

## LINE Group usage
- [ ] The bot only responds to messages starting with `!` — ordinary group chat messages are ignored (no reply, no error).
- [ ] Multiple people in the group can place orders and the order numbers/handling remain correct and non-conflicting.
