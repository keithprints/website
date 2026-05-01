# Architecture

This is a deeper look at how the pieces fit, intended for whoever maintains the site after the initial deploy.

## High-level flow

```
Customer browser
    │
    ├── GET /  →  Vercel (static HTML/CSS/JS)
    │              │
    │              └── fetchProducts() → Supabase REST API (anon key)
    │                                      │
    │                                      └── RLS filters: only active products,
    │                                          only public columns
    │
    ├── POST /api/checkout  →  Vercel Function (Node.js)
    │                            │
    │                            ├── Fetch product (service role, gets cost data)
    │                            └── Create Stripe Checkout Session
    │                                  ↓
    │                                  Returns URL to Stripe-hosted checkout
    │
    └── Customer redirects to Stripe Checkout
            │
            (customer pays)
            │
            ├── Customer redirected to /?checkout=success
            └── Stripe sends webhook to /api/webhook
                  │
                  └── Verifies signature
                       └── Inserts row into orders table (service role)
                            └── Stripe sends receipt email automatically
```

## Why each piece exists

### Vite + vanilla JS (not React)

The site is ~30 product cards, one modal, one filter bar. React would add a build pipeline, hydration concerns, framework upgrade churn, and bundle size for negative benefit at this scale. Vanilla JS with Vite gives us hot reload in dev and a tiny prod bundle. If the site ever grows into something with stateful flows (multi-page checkout, real-time inventory, customer accounts), revisit this — but it's not premature optimization to skip React for a 5-component site.

### Supabase (not Airtable, not Firebase, not raw Postgres)

- **Real Postgres** — schemas, foreign keys, views, RLS policies. We use all four.
- **Built-in admin UI** — Mom edits products in the Table Editor, no custom CMS needed.
- **Generous free tier** — 500MB DB, 5GB bandwidth, 50K monthly active users. Keith won't approach any limit.
- **RLS is doing real work** — it ensures the `unit_cost_cents` column is never readable by the anon key, even if someone tries to query for it. Defense in depth alongside the explicit `select(...)` whitelist in `lib/supabase.js`.

### Stripe Checkout (not Stripe Elements, not PayPal, not Square)

- **Hosted by Stripe** — we don't touch card data, PCI compliance is Stripe's problem.
- **Built-in fraud protection** — Stripe Radar runs by default.
- **Handles wallets** — Apple Pay, Google Pay, Link all work without code changes.
- **Sends receipts automatically** — Stripe emails customers and merchants, we don't.
- **Per-transaction pricing** — no monthly fees, perfect for low/variable volume.

### Vercel (not Netlify, not Cloudflare Pages, not GitHub Pages)

GitHub Pages was the owner's first instinct, and it's a fine static host. We need serverless functions for Stripe (you can't put a secret key in the browser), and Vercel + GitHub Pages would mean two deploys to coordinate. Vercel does both: static site + serverless functions, one deploy.

Cloudflare Pages would also work and is arguably faster, but Vercel's git integration is smoother for someone new to ops.

## The data model in detail

### Why a single products table

E-commerce orthodoxy says "products and variants in separate tables." For this scale that's premature normalization. Colors are a `text[]` on the product, and that's the only varying attribute. If we ever need per-color pricing or per-color inventory, then split — until then, the `array_contains` filter handles "show me products available in blue" just fine.

### Why prices live in cents (int)

Floating point money is a known footgun. `0.1 + 0.2 != 0.3` in JavaScript. Stripe also expects cents. Storing as `int` cents from end to end means no conversion errors and no rounding bugs.

### Why orders snapshot prices

If Keith raises the wolf keychain from $8 to $10, all his historical sales would suddenly show $10 in revenue if `orders` referenced live product prices. We snapshot `sale_price_cents` and `unit_cost_cents` into the order row at write time. This is standard e-commerce practice.

### Why orders.product_id is `on delete set null`

If Keith deletes a product, we don't want to lose the order history. Setting product_id to null preserves the order with `product_name` (also snapshotted) intact.

### The three views (bestsellers, monthly_summary, unsold_products)

These aren't stored data — they're queries that compute on demand. Free, fast, always correct. Showing up in Supabase's Table Editor as "tables" Mom can browse.

The `bestsellers` view is doing the heavy lifting for Keith's "what should I print more of" decision. Sort descending by units_sold and the answer is right there.

## RLS policies explained

### Anon role (the public website)

```sql
-- Can SELECT from products WHERE active = true
-- Application also restricts which columns are returned
-- Cannot SELECT, INSERT, UPDATE, DELETE on orders
```

The application explicitly selects only public columns in `fetchProducts()`. RLS adds the `active = true` filter. Even if someone bypassed our application code and queried the API directly with the anon key, they couldn't get inactive products or unit costs.

### Authenticated role (Keith and Mom)

```sql
-- Full CRUD on products
-- Full CRUD on orders
```

Authentication via Supabase Auth. Email/password. We rely on Supabase's built-in password hashing and session management.

### Service role (the webhook function only)

Service role bypasses RLS. We use it in `/api/webhook` to insert orders without needing to authenticate. The service role key NEVER touches the browser — it's a Vercel env var read by the serverless function.

## Stripe webhook security

The `/api/webhook` endpoint is publicly accessible (it has to be, Stripe needs to reach it). Anyone could POST to it. We protect against fake webhook calls with two things:

1. **Signature verification** — Stripe signs every webhook with the signing secret. We verify the signature before doing anything. A request without a valid signature gets a 400.
2. **Idempotency** — Even if Stripe retries a webhook (which they do — at-least-once delivery), we check `stripe_session_id` for uniqueness before inserting. Duplicate webhook → no duplicate order.

The body parser is disabled (`bodyParser: false`) because Stripe signature verification needs the exact raw bytes of the body. Letting Vercel parse it as JSON would break the signature check.

## Dev/prod parity

Same code runs in both. Differences are entirely in env vars:

| Var | Local dev | Production |
|---|---|---|
| `SITE_URL` | `http://localhost:5173` | `https://keithprints.vercel.app` |
| `STRIPE_*` | Test keys (`pk_test_`, `sk_test_`) | Live keys (`pk_live_`, `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen --forward-to localhost:3000/api/webhook` | From the production webhook endpoint |

Local webhooks require running `stripe listen` in another terminal — see Stripe's CLI docs.

## Things we deliberately didn't build

These came up in the planning conversation and were explicitly cut. Documented here so future maintainers don't waste time wondering whether to add them:

- **Cart** — single-item checkout is fine at this volume
- **Inventory tracking** — print-to-order means there's nothing to track
- **Customer accounts** — Stripe collects email, that's enough
- **In-app admin UI** — Supabase's Table Editor IS the admin
- **Abandoned cart recovery** — not earned at this volume
- **Multiple shipping options** — flat $3.50 ground; complexity not justified
- **Tax calculation** — Stripe Tax exists if needed; Keith probably under nexus thresholds anywhere
- **Order status emails** — Stripe sends receipts; tracking emails are manual
- **Discount codes** — Stripe supports them via the dashboard if needed; not built into the app
- **Reviews/ratings** — different problem; Instagram comments serve this for now

## When to revisit decisions

| Trigger | What to reconsider |
|---|---|
| 50+ orders/month consistently | Maybe add automated order status emails |
| Customers asking for multi-item discounts | Add a real cart |
| Pre-printed inventory becomes a thing | Add inventory tracking, low-stock alerts |
| Selling in multiple states with sales tax | Stripe Tax integration |
| Mom getting overwhelmed by manual order updates | Status update from email reply (Postmark inbound, etc.) |
| Site loading slowly with 200+ products | Add pagination or virtual scrolling |
| Wanting to sell digital files (3D models) | Whole different architecture — separate project |

Until those triggers fire, the simpler version is the better version.

## File structure rationale

```
api/                    # Serverless functions (Vercel detects automatically)
public/                 # Static assets served as-is (banner, favicon)
src/
  main.js               # Entry point, app shell, state
  style.css             # All styles (no Tailwind, intentional)
  lib/
    supabase.js         # Database client + public catalog query
    format.js           # Currency formatting, category helpers
  components/
    catalog.js          # Grid renderer
    productCard.js      # Single card markup
    buyModal.js         # Color picker + engraving + checkout trigger
supabase/
  migrations/           # Schema-as-code, version controlled
  seed.sql              # Initial product data
docs/                   # All the markdown context
CLAUDE.md               # Project memory for Claude Code
```

No `components/` subfolders, no design system separation, no shared types. The project is small enough that one level of organization is enough. If components/ ever exceeds ~10 files, add structure then.
