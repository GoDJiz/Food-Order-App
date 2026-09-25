# Installation Guide

This guide walks you through setting up the Food Order App from scratch. You don't need to be a programmer to follow it — just go step by step, in order.

## What you'll need before starting

Create free accounts on these four services (all have free tiers sufficient for this app):

1. **GitHub** — [github.com](https://github.com) — holds the project's code.
2. **Supabase** — [supabase.com](https://supabase.com) — the database.
3. **Vercel** — [vercel.com](https://vercel.com) — hosts the live app (can sign up using your GitHub account).
4. **LINE Developers** — [developers.line.biz](https://developers.line.biz) — lets your LINE bot talk to the app. Use the same LINE account you (or your business) already use.

You'll also want a text editor or terminal available briefly for two one-time setup commands (generating a PIN hash and a session secret) — instructions below don't assume prior experience.

## Setup order

Follow these steps **in this order**. Each step depends on the one before it.

1. Push this project to a new GitHub repository
2. Create a Supabase project and run the database setup
3. Create a LINE Messaging API channel
4. Deploy to Vercel with the right environment variables
5. Connect the LINE webhook to your live Vercel URL
6. Set up your dashboard PIN
7. Add your first product
8. Send a test order in your LINE group
9. Try changing an order's status
10. Explore the dashboard

---

### Step 1 — Push the project to GitHub

1. Create a new, empty repository on GitHub (don't initialize it with a README — this project already has one).
2. From your computer, push this project's code to that repository (standard `git init`, `git remote add origin <your-repo-url>`, `git push`). If you're not comfortable with git commands, GitHub Desktop's "Add existing folder" feature does the same thing with buttons instead of commands.

### Step 2 — Set up Supabase

Follow **`supabase/README.md`** in this repository in full — it covers creating the project, running the database migration, and verifying everything is in place. Come back here once that's done.

Keep these two values handy from that step — you'll need them in Step 4:
- Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`)

### Step 3 — Create your LINE Messaging API channel

1. Go to [developers.line.biz/console](https://developers.line.biz/console) and log in.
2. Create a new **Provider** (if you don't already have one) — this is just an umbrella name, e.g. your shop's name.
3. Inside the provider, create a new **Channel** of type **Messaging API**.
4. Fill in the required fields (channel name, description, category — your shop's name and a short description are fine).
5. Once created, open the channel and go to the **Messaging API** tab.
6. Note down:
   - **Channel secret** (Basic settings tab) → this becomes `LINE_CHANNEL_SECRET`
   - **Channel access token** (Messaging API tab → "Issue" a long-lived token if one isn't already there) → this becomes `LINE_CHANNEL_ACCESS_TOKEN`
7. On the same Messaging API tab, turn **off** "Auto-reply messages" and "Greeting messages" — these are LINE's default chat features and would interfere with the bot's own replies.
8. Leave "Webhook" **off** for now — you'll turn it on in Step 5, once you have a real URL to point it at.

### Step 4 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com), sign in (GitHub sign-in is easiest), and click **Add New → Project**.
2. Select the GitHub repository you pushed in Step 1.
3. Vercel will detect it as a Next.js project automatically — you don't need to change the build settings.
4. Before deploying, open **Environment Variables** and add all six of these:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (the **service_role** key) |
| `LINE_CHANNEL_SECRET` | LINE Developers Console → your channel → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → your channel → Messaging API tab |
| `DASHBOARD_PIN_HASH` | Generated in Step 6 below — you can come back and add this after first deploy |
| `SESSION_SECRET` | Generated in Step 6 below |

5. Click **Deploy**. Vercel will install dependencies and build the project — this takes a few minutes the first time.
6. Once done, Vercel gives you a live URL like `https://your-project.vercel.app`. Visit it — you should be redirected to a login screen (this confirms Phase 4's auth is working before you've even set a real PIN yet — you just can't log in until Step 6).

### Step 5 — Connect the LINE webhook

1. Your webhook URL is: `https://your-project.vercel.app/api/line/webhook` (replace with your actual Vercel URL).
2. In the LINE Developers Console, go to your channel's **Messaging API** tab.
3. Under **Webhook settings**, paste that URL into **Webhook URL** and click **Update**.
4. Click **Verify** — LINE will send a test request; you should see a success message. (If it fails here, double check `LINE_CHANNEL_SECRET` is set correctly in Vercel and that you redeployed after setting it.)
5. Turn the **Use webhook** toggle **ON**.

### Step 6 — Set up your dashboard PIN

The app never stores your PIN as plain text — only a one-way hash of it. You choose the PIN once, generate its hash on your own computer, and only the hash goes into Vercel.

1. On your computer, with this project's code and `npm install` run once (see the project's own `README.md` for that), run:
   ```
   npm run generate-pin-hash -- 1234
   ```
   (replace `1234` with whatever PIN you actually want to use — keep it private).
2. This prints a line like `DASHBOARD_PIN_HASH=$2a$12$...`. Copy the value after the `=`.
3. In Vercel → your project → Settings → Environment Variables, add `DASHBOARD_PIN_HASH` with that value (or edit it if you added a placeholder in Step 4).
4. Also generate a `SESSION_SECRET` — any long random string works, e.g. run `openssl rand -base64 32` in a terminal, or use any password generator to create a 32+ character random string. Add it as `SESSION_SECRET` in Vercel the same way.
5. Redeploy (Vercel → Deployments → click the latest one → Redeploy) so the new environment variables take effect.
6. Visit your app URL again, and log in with the PIN you chose in step 1.

### Step 7 — Add your first product

1. Once logged in, go to the **Products** tab.
2. Fill in the form: Name (e.g. "Orange Juice"), Unit (e.g. "bottle"), Selling price (e.g. 20), Cost price (e.g. 10), and make sure "Active" is checked.
3. Click **Add product**.

### Step 8 — Add the bot to your LINE group and send a test order

1. In the LINE Developers Console → your channel → Messaging API tab, scroll to find the **QR code** (or "Bot basic ID") for your channel.
2. Add the bot as a friend using that QR code, then invite it into your order-taking LINE group the same way you'd invite any contact.
3. In the group, send a message matching your product name, e.g.:
   ```
   !Orange Juice 1 P'Kai
   ```
4. The bot should reply within a couple of seconds with something like:
   ```
   สรุปคำสั่งซื้อ เลขที่ #260916-0001 สินค้า Orange Juice จำนวน 1 bottle ชื่อลูกค้า P'Kai สถานะ สั่งซื้อ
   ```
5. Check the **Orders** and **Today** tabs in the dashboard — the order should appear immediately.

### Step 9 — Try changing an order's status

You can change status either from the dashboard (Orders tab → tap the status dropdown on the order) or from LINE itself:
```
!#260916-0001 2
```
(replace with your real order number from Step 8) — the bot will reply confirming the new status. Try `!#260916-0001` on its own to look up the order without changing anything.

### Step 10 — Explore the dashboard

- **Today** — today's order count, items, sales, cost, profit, and what's still left to make.
- **Orders** — every order placed today, with a dropdown to change status.
- **Products** — add, edit, activate/deactivate products.
- **Reports** — pick any date to see a full breakdown by product.
- **Settings** — log out.

---

## Supported LINE commands

| Command | What it does |
|---|---|
| `!<product> <quantity> <customer>` | Places a new order, e.g. `!น้ำส้ม 1 พี่ไก่` |
| `!#260916-0001` | Looks up an order without changing it |
| `!#260916-0001 1` | Sets status to สั่งซื้อ (placed) |
| `!#260916-0001 2` | Sets status to รับออเดอร์ (making) |
| `!#260916-0001 3` | Sets status to ชำระเงินแล้ว (paid) |
| `!#260916-0001 4` | Sets status to ยกเลิก (cancelled) |
| `!summary` | Shows today's short summary in the LINE group |

---

## Basic troubleshooting

**The bot doesn't reply in the group at all.**
- Check the webhook is turned ON in the LINE Developers Console and the URL is exactly `https://your-project.vercel.app/api/line/webhook` (no typos, correct project name).
- Check `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` are set correctly in Vercel, and that you redeployed after setting them.
- In the LINE Developers Console, use the **Verify** button under webhook settings — it tells you immediately if the connection is broken.

**The bot replies with "❗Invalid format".**
- Check your message matches exactly: `!<product> <quantity> <customer>`, with the quantity as a plain positive number, e.g. `!Orange Juice 1 P'Kai`.

**The bot replies "ไม่พบสินค้า" (product not found).**
- The product name must match an **active** product in the Products tab (not case-sensitive, but spelling must match). Check the Products tab for the exact name, or add the product if it doesn't exist yet.

**The bot replies "ไม่พบคำสั่งซื้อ" (order not found).**
- Double-check the order number, including the `#` and the dash — copy it exactly from a previous bot reply.

**I can't log into the dashboard.**
- Make sure `DASHBOARD_PIN_HASH` and `SESSION_SECRET` are both set in Vercel and that you redeployed after adding them.
- If you've forgotten your PIN, generate a new hash (Step 6) for a new PIN and update `DASHBOARD_PIN_HASH` in Vercel, then redeploy.

**A new order isn't showing up on the Today/Orders page.**
- Refresh the page. If it still doesn't appear, check the LINE bot actually replied with a success message (not an error) for that order — if it replied with an error, nothing was saved, which is expected behavior.

**Something else looks broken.**
- Check Vercel's **Deployments → (latest) → Functions/Logs** tab for error messages — this is the most direct way to see what went wrong on the server side.

## Free-tier limitations

- **Vercel Hobby plan:** free for personal/small projects; serverless functions have execution time and bandwidth limits — more than enough for this app's message volume, but worth knowing if you scale up significantly.
- **Supabase free tier:** limited database storage and connection count; projects can pause after inactivity (resume manually from the dashboard if that happens).
- **LINE Messaging API free tier:** a monthly limit on **push** messages — this app only uses **reply** messages (replying to an incoming message within the LINE-given reply window), which do **not** count against that push quota, so this limitation does not affect the app's core order-taking flow.
