# Architecture

A deeper look at how the pieces fit, intended for whoever maintains the site after the initial deploy.

## High-level flow

```
Customer browser
    │
    ├── GET /  →  Vercel (static HTML/CSS/JS, public bundle)
    │              │
    │              └── fetchProducts() → Supabase REST (anon key)
    │                                      │
    │                                      └── RLS: anon SELECT on
    │                                          public columns of
    │                                          active products only
    │
    ├── Add to cart → localStorage (kp_cart_v1)
    │
    ├── POST /api/checkout  →  Vercel Function (Node.js)
    │                            │
    │                            ├── Validates cart, fetches products
    │                            │   server-side (service role) for
    │                            │   authoritative pricing + cost snapshot
    │                            ├── Builds shipping options based on
    │                            │   delivery method (standard vs local zip)
    │                            └── Creates Stripe Checkout Session
    │                                  ↓
    │                                  Returns Stripe-hosted URL
    │
    ├── Customer redirects to Stripe Checkout
    │       │
    │       (customer pays)
    │       │
    │       └── Stripe → POST /api/webhook (signed)
    │             │
    │             └── Verifies signature
    │                  └── Inserts orders row (parent)
    │                       └── Inserts order_items rows (children)
    │                            └── Stripe also sends customer receipt
    │
    └── Customer redirected to /?checkout=success → cart cleared, toast


Operator browser
    │
    └── GET /admin  → Vercel rewrites to /admin.html (separate Vite entry)
                       │
                       ├── Auth flow: email/password → TOTP MFA → AAL2 session
                       │
                       └── Product CRUD via authenticated Supabase REST
                            │
                            └── RLS: authenticated role full access ONLY
                                if (auth.jwt() ->> 'aal') = 'aal2'
```

## Why each piece exists

### Vite + vanilla JS (not React)

The public site is a few hundred lines of JS for a catalog with maybe 50 product cards, one cart drawer, one detail modal. React would add a build pipeline, hydration concerns, framework upgrade churn, and bundle size for negative benefit. Vanilla JS with Vite gives us hot reload in dev and a small prod bundle. If the site ever grows into something with stateful flows (multi-page checkout, real-time inventory, customer accounts), revisit — but it's not premature optimization to skip React for a site this size.

### Two Vite entry points (public site + admin panel)

`index.html` and `admin.html` are independent entries. The public site bundle never imports admin code; the admin bundle never imports public-site features. Vite handles the split automatically via `rollupOptions.input` in `vite.config.js`. `vercel.json` rewrites `/admin` to `/admin.html`.

### Supabase (not Airtable, not Firebase, not raw Postgres)

- **Real Postgres** — schemas, foreign keys, views, RLS policies, column-level grants. We use all five.
- **Built-in auth + MFA** — Supabase's TOTP support powers the admin login flow without a custom auth backend.
- **Storage** — `product-images` bucket holds product photos; public-read, AAL2-write. CDN-served URLs.
- **Generous free tier** — 500 MB DB, 5 GB bandwidth, plenty of monthly active users for this scale.
- **RLS is doing real work** — column-level grants ensure `unit_cost_cents` is never readable by the anon key, and view ACLs prevent anon from reading analytical views (which would otherwise leak revenue/profit).

### Stripe Checkout (hosted, not Elements)

- **Hosted by Stripe** — we don't touch card data; PCI compliance is Stripe's problem.
- **Built-in fraud protection** — Stripe Radar runs by default.
- **Wallets** — Apple Pay, Google Pay, Link work without code changes.
- **Sends receipts automatically** — Stripe emails customers on successful payment.
- **Per-transaction pricing** — no monthly fees, perfect for variable volume.

### Vercel (not Netlify, not Cloudflare Pages)

We need serverless functions for Stripe (a secret key can't ship to the browser), and Vercel does both static hosting and Node functions in one deploy. Cloudflare Pages would also work; Vercel's Git integration is what tipped it.

## The data model

### Products

Single table `products`, no separate variants. Today's varying attributes are just colors (`text[]`), customizable flag, and customization metadata. Photos: one primary image (`image_url`) plus a gallery (`gallery_urls text[]`).

`unit_cost_cents` is private — not in the anon column-grant allow list (migration 005). Authenticated AAL2 reads it for margin reporting.

### Orders + order_items (cart-shaped)

Multi-item carts produce one parent `orders` row plus N `order_items` rows. The webhook writes both atomically: if `order_items` insert fails, the parent is rolled back so we never end up with a paid order missing its items.

Legacy single-item columns on `orders` (product_id, product_name, color, customization_text, sale_price_cents, unit_cost_cents) are kept nullable for backwards-compatibility with any pre-cart test rows. The views read from `order_items` only.

### Why prices live in cents (int)

Floating-point money is a known footgun (`0.1 + 0.2 != 0.3` in JS). Stripe also expects cents. Storing as int cents end-to-end means no conversion errors, no rounding bugs.

### Why orders snapshot prices

If you raise a product from $8 to $10, all historical sales would suddenly show $10 in revenue if `order_items` referenced live product prices. We snapshot `sale_price_cents` and `unit_cost_cents` into the order_items row at write time. Standard e-commerce practice.

### `on delete set null` on order_items.product_id

If you delete a product, we don't want to lose the order history. Setting `product_id` to null preserves `product_name`, `color`, and the snapshotted prices on the order_items row.

### The three views

`bestsellers`, `monthly_summary`, `unsold_products` are queries that compute on demand from `products` + `orders` + `order_items`. Free, fast, always correct. Available to authenticated AAL2 sessions only — the anon role was explicitly revoked in migration 005 to prevent unit-cost / revenue leakage.

## RLS, in detail

### Anon role (the public website)

```
products:           SELECT (column-restricted — see migration 005);
                    rows filtered by RLS to active = true
orders, order_items: NO access
storage.objects:    SELECT on product-images bucket (public photos)
```

Column-level grants on `products` enforce that anon can read only the public-facing columns. Even a malicious caller hitting the REST API directly with `?select=unit_cost_cents` gets `permission denied for column unit_cost_cents`.

### Authenticated role (operator after MFA)

```
products, orders, order_items:  ALL operations
                                IF (auth.jwt() ->> 'aal') = 'aal2'
storage.objects (product-images): INSERT / UPDATE / DELETE
                                  IF (auth.jwt() ->> 'aal') = 'aal2'
```

AAL stands for Authentication Assurance Level. AAL1 is password-only; AAL2 is password + a verified second factor (TOTP). The admin app forces enrollment + verification on first login; subsequent sessions challenge for the 6-digit code.

A password leak alone doesn't grant write access — without TOTP, the JWT carries `aal=aal1` and every write fails RLS.

### Service role (the webhook function only)

Service role bypasses RLS. Used in `/api/webhook` to insert orders and order_items without authenticating. The service role key never touches the browser — it's a Vercel env var read only by the serverless function.

### Supabase dashboard fallback

The Supabase dashboard's internal admin role also bypasses RLS, so the Table Editor remains a working fallback for any catalog work the `/admin` panel can't do. You can hand-edit orders, run ad-hoc SQL, etc.

## Stripe webhook security

The `/api/webhook` endpoint is publicly accessible (Stripe needs to reach it). Two layers of defense:

1. **Signature verification** — Stripe signs every webhook with the signing secret. We verify the signature before doing anything; mismatches return 400. Vercel's body parser is disabled (`bodyParser: false`) so we have the exact raw bytes for verification.
2. **Idempotency** — `stripe_session_id` has a unique constraint. The handler checks for an existing row before inserting; if a race causes two retries to both pass the check, the unique-violation error code (`23505`) is caught and treated as success.

Each Stripe mode (test / live / each named Sandbox) has its own webhooks and signing secrets. When switching modes, you rotate `STRIPE_WEBHOOK_SECRET` in Vercel.

## Local-delivery zone

`src/lib/delivery.js` exports `isLocalDeliveryZip(zip)` — returns true for `94501` or `94502` today. The same module is imported by both the cart drawer (client) and `api/checkout.js` (server) so the eligibility logic stays in sync. The server re-validates the zip before sending the free-shipping option to Stripe — never trust the client-supplied flag alone.

This single function is the boundary between today's hardcoded list and a future "within X miles of 94501" upgrade — replace the lookup with a geocoding API call and callers don't change.

## Cart state

Lives in `localStorage` under `kp_cart_v1`. Object shape:

```js
{
  items: [{ key, productId, productName, productCategory, productImageUrl,
            color, customizationText, priceCents, quantity }, ...],
  deliveryMethod: 'shipping' | 'local',
  deliveryZip: '...'
}
```

Pub/sub via `src/lib/cart.js`'s `subscribe(fn)` lets the cart drawer and nav badge stay in sync. The legacy array-only shape (pre-delivery-method) is silently migrated on read.

`priceCents` is for display only — the server re-prices in `api/checkout.js` from authoritative product data. A malicious client editing localStorage can't change what they pay.

## Dev/prod parity

Same code runs in both. Differences are entirely in env vars:

| Var | Local dev | Production |
|---|---|---|
| `SITE_URL` | `http://localhost:5173` | `https://www.keithprints.com` |
| `STRIPE_*` | Test keys (`pk_test_`, `sk_test_`) | Live keys (`pk_live_`, `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen --forward-to localhost:3000/api/webhook` | From the production webhook endpoint |

Local webhook testing requires running `stripe listen` in another terminal — see Stripe's CLI docs.

## Security headers

`vercel.json` sets these on every response:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'`

CSP allows `style-src 'unsafe-inline'` because category-gradient backgrounds are applied via inline `style="background:..."` attributes on product cards. Inline scripts are not allowed.

## Things we deliberately didn't build

These came up in planning and were explicitly cut. Documented here so future maintainers don't waste time wondering whether to add them:

- **Inventory tracking** — print-to-order means there's nothing to track
- **Customer accounts** — Stripe collects email, that's enough
- **Abandoned cart recovery** — not earned at this volume
- **Tax calculation** — Stripe Tax exists if needed; nexus thresholds rarely hit at this scale
- **Order status emails** — Stripe sends receipts; tracking emails are manual
- **Discount codes** — Stripe supports them via the dashboard if needed; not built into the app
- **Reviews/ratings** — different problem; social channels serve this for now
- **Rate limiting on /api/checkout** — at this volume, the abuse surface is small

## When to revisit decisions

| Trigger | What to reconsider |
|---|---|
| 50+ orders/month consistently | Maybe add automated order status emails (Resend) |
| Operator overwhelmed by checking Supabase for line items | Add a custom fulfillment email via Resend |
| Per-product color restrictions feel arbitrary | Color refactor — see PUNCHLIST.md (shop_colors + multicolor variants) |
| Pre-printed inventory becomes a thing | Add inventory tracking, low-stock alerts |
| Selling in multiple states with sales tax | Stripe Tax integration |
| Site loading slowly with 200+ products | Add pagination or virtual scrolling |
| Wanting to sell digital files (3D models) | Whole different architecture — separate project |
| Going public on GitHub | History rewrite to fully purge any past CLAUDE.md / PUNCHLIST.md contents |

Until those triggers fire, the simpler version is the better version.

## File structure

```
api/                     # Serverless functions (Vercel auto-detects)
  checkout.js              creates Stripe sessions for full carts
  webhook.js               writes orders + order_items, signed by Stripe
public/                  # Static assets served as-is
  banner.jpg
src/
  main.js                  public site entry
  admin.js                 admin panel entry (loaded only at /admin)
  style.css                all styles (no Tailwind, intentional)
  lib/
    supabase.js            client wrapper + public catalog query
    format.js              currency, category labels/gradients
    cart.js                cart state (localStorage, pub/sub)
    delivery.js            local-zone zip eligibility (shared client + server)
  components/
    catalog.js             grid renderer + filter/search
    productCard.js         single card markup
    productModal.js        detail view (gallery, color, customization, Add-to-Cart)
    cartDrawer.js          slide-out cart with line items + Checkout button
  admin/
    auth.js                Supabase auth + TOTP MFA wrapper
    products.js            CRUD on products table (admin-only)
    productList.js         admin table with search/filter/inline toggles
    productForm.js         create/edit modal form
    storage.js             Supabase Storage upload/delete helpers
    imageUploader.js       drag-drop + thumbnail UI (single/multi mode)
supabase/
  migrations/              schema-as-code, version controlled (run in order)
  seed.sql                 initial product data
docs/                    # Maintainer documentation (this file lives here)
admin.html               # Admin panel HTML entry
index.html               # Public site HTML entry
vercel.json              # Build + headers + rewrite config
vite.config.js           # Multi-entry build
```

No `components/` subfolders, no design-system separation, no shared types. The project is small enough that one level of organization is enough. If `components/` ever exceeds ~10 files, add structure then.
