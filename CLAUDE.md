# Keith Prints — Project Memory for Claude Code

## What this is

Keith Prints is a small e-commerce website for a hobby 3D-printing shop. The shop sells keychains, fidgets, figurines, and ornaments — printed to order on a single 3D printer named **Keith**. The site exists to capture sales between bi-annual local markets — typically a few orders per month at peak, sometimes zero. It is **not** a high-volume shop and should not be over-engineered for scale.

**About the name.** "Keith" is the printer, not a person. The site uses a printer-as-mascot voice for customer-facing copy (`"I'm Keith and I make stuff that's actually cool"`, `"kid-run, kid-approved"`, etc.) — that's intentional brand voice and should be preserved. Operationally, **Elliott is the sole owner/operator**: he runs the printer, fulfills orders, manages the catalog, and handles all admin. There is no separate "Keith" or "Mom" stakeholder.

The brand voice is "kid-run, kid-honest, late elementary/middle school." Chunky display type, neon accents on a warm cream background, sticker-pop drop shadows. The hero banner is a hero asset — keep it prominent. Voice is direct and a little cheeky, never babyish ("Cool things. 3D printed. Just for you.").

## The stack

| Layer | Service | Free tier sufficient? |
|---|---|---|
| Frontend | Vite + vanilla JS (no React) hosted on Vercel | Yes |
| Database | Supabase (Postgres) | Yes — 500MB DB, plenty for this |
| Payments | Stripe Checkout (hosted) via Vercel serverless function | Pay-per-transaction only |
| Email | Stripe sends order emails automatically; rich fulfillment email TBD via Resend | N/A |
| DNS | Owner-provided domain (~$12/yr) | N/A |

**Why no React:** the site is a few hundred lines of vanilla JS for a catalog with maybe 50 product cards and one checkout button. Adding React/Next would multiply the surface area for no real gain. Vite + plain JS keeps the deploy fast and the code grokkable.

**Why Supabase over Airtable:** Owner explicitly chose Supabase. Real Postgres, free tier covers needs, has built-in admin UI (Table Editor) that's nearly as easy as Airtable for non-technical editing. Bonus: row-level security means we can expose public product data via the anon key without leaking cost/profit fields.

## Critical scoping decisions (don't undo these)

These are decisions that emerged from a long conversation with Elliott. Re-litigating them wastes time:

1. **Print-to-order. No inventory tracking.** Every sale assumes the order will be printed after it arrives. No stock counts, no "sold out" states, no decrements, no race conditions to worry about. The website tells customers "ships within a week" because that's how long printing takes.

2. **Single product table is fine.** No separate variants table. Colors are a `text[]` array on the product itself. If color-specific pricing or images ever becomes a need, split it then. Today, a customer picks a color from a dropdown and that selection rides along with the order.

3. **Cart-based checkout.** Customers add items to a slide-out cart (state lives in `localStorage`, no auth needed) and check out once with all of them. Storage key `kp_cart_v1`. *(Originally scoped as "no cart, single-item Buy Now" — reversed 2026-05-04 after observing the friction of forcing customers through Stripe Checkout once per item.)*

4. **Profit/cost data lives in the same products table but is gated by RLS.** The `unit_cost_cents` field is private. Public site never sees it. Elliott sees it via Supabase auth.

5. **Order history is the financial source of truth.** Every Stripe webhook writes one parent `orders` row plus one `order_items` row per cart line, snapshotting price and unit cost AT THE TIME OF SALE. Don't reference live product fields for historical analysis — prices change, snapshots don't.

6. **No automation Elliott could do manually in 10 seconds.** When an order arrives, Stripe emails him and the webhook writes the order to Supabase. He prints, ships, marks the order `shipped` in Supabase. Don't build label printing, automated tracking emails, or shipping integrations until volume justifies it.

7. **Local delivery zone is zip-list based.** Customers in `94501` or `94502` get a "Free local pickup/delivery" option in the cart that bypasses the $3.50 standard shipping. The eligible-zip list lives in `src/lib/delivery.js` (`isLocalDeliveryZip`) — that single function is the boundary between today's hardcoded list and a future "within 5 miles of 94501" upgrade (replace the lookup with a geocoding API call; callers don't change). The same module is imported by both the cart drawer and `api/checkout.js`, so server and client stay in sync. The server re-validates the zip before sending the free-shipping option to Stripe — never trust the client-supplied flag alone.

8. **Custom admin panel at `/admin`, gated by MFA.** Reverses the original "no admin UI" decision after observing that Supabase's Table Editor is awkward for product management (especially photo URL workflow). The admin panel lives at `/admin` (rewrite to `admin.html` in `vercel.json`), is a separate Vite entry, and uses Supabase email/password + TOTP MFA (Authentication Assurance Level 2). RLS on `products`, `orders`, `order_items` is hardened to require `aal2` for the authenticated role — see migration `004_admin_rls_aal2.sql`. The Supabase Table Editor still works as a fallback because the dashboard's internal admin role bypasses RLS.

## The data model

### `products` table

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `created_at` | `timestamptz` default `now()` | |
| `name` | `text` not null | "Wolf Keychain" |
| `slug` | `text` unique not null | URL-friendly |
| `description` | `text` | Customer-facing short blurb (used on cards) |
| `details` | `text` | Long-form copy shown in the product detail modal. Falls back to `description` when null. |
| `category` | `text` | keychains / fidgets / figurines / ornaments / more |
| `image_url` | `text` | Primary image — first slot in the gallery. Hosted on Supabase Storage or external |
| `gallery_urls` | `text[]` | Additional photos shown alongside `image_url` in the detail modal |
| `colors` | `text[]` | `{Blue, Red, Black, Glow}` |
| `customizable` | `boolean` default false | Triggers engraving field at checkout |
| `customization_label` | `text` | "Engrave a name (max 8 chars)" — only used if customizable |
| `customization_max_chars` | `int` default 8 | |
| `sale_price_cents` | `int` not null | Stripe wants cents. $8.00 = 800 |
| `unit_cost_cents` | `int` not null | **PRIVATE.** Filament + electricity per print |
| `print_time_hours` | `numeric(4,1)` | Surfaced as a chip in the detail modal ("🖨 ~6h print") and used for print scheduling |
| `active` | `boolean` default true | Hidden from site if false |
| `featured` | `boolean` default false | Show "HOT" or "FAV" badge |
| `badge` | `text` | "new" / "hot" / "fav" — overrides featured logic if set |
| `display_order` | `int` default 0 | Manual ordering within category |

### `orders` table (parent — one row per cart checkout)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `created_at` | `timestamptz` default `now()` | |
| `stripe_session_id` | `text` unique not null | Idempotency key for webhooks |
| `customer_email` | `text` | From Stripe |
| `customer_name` | `text` | From Stripe |
| `shipping_address` | `jsonb` | Full address from Stripe |
| `delivery_method` | `text` default `'shipping'` | `shipping` / `local`. Used by local-delivery zip gating |
| `subtotal_cents` | `int` | Sum of (sale_price × qty) across order_items |
| `shipping_cents` | `int` default 0 | Stripe-computed shipping charge |
| `total_cents` | `int` | Stripe `amount_total` |
| `status` | `text` default 'new' | new / printing / shipped / cancelled |
| `notes` | `text` | Free-form fulfillment notes |
| ~~`product_id`, `product_name`, `color`, `customization_text`, `sale_price_cents`, `unit_cost_cents`~~ | (legacy) | Pre-cart single-item columns. NULL on cart-shaped rows; data lives in `order_items` instead. Kept for backwards-compatibility with any pre-cart test rows; not used by views. |

### `order_items` table (child — one row per cart line)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `order_id` | `uuid` FK → orders(id) on delete cascade | |
| `product_id` | `uuid` FK → products(id) on delete set null | |
| `product_name` | `text` not null | Snapshot |
| `color` | `text` | What customer picked |
| `customization_text` | `text` | Engraving if any |
| `quantity` | `int` not null default 1, > 0 | |
| `sale_price_cents` | `int` not null | Per-unit snapshot at sale time |
| `unit_cost_cents` | `int` not null | Per-unit snapshot at sale time |
| `created_at` | `timestamptz` default `now()` | |

### Row-level security

- `products` table: anon role can `SELECT` columns `id, name, slug, description, details, category, image_url, gallery_urls, colors, customizable, customization_label, customization_max_chars, sale_price_cents, print_time_hours, featured, badge, display_order` WHERE `active = true`. Authenticated role (Elliott) can do everything. (Column visibility is enforced in `src/lib/supabase.js`'s explicit SELECT — RLS is row-level only.)
- `orders` and `order_items` tables: anon role gets nothing. Authenticated role does everything.
- Service role (used by webhook function only) bypasses RLS.

The public website uses the `anon` key. The webhook function uses the `service_role` key (set as a Vercel env var, never exposed to the browser).

### Useful Supabase views (created in migration)

- `bestsellers` — products joined with order counts and revenue, sorted by units sold desc.
- `monthly_summary` — revenue, cost, profit, margin grouped by month.
- `unsold_products` — active products with zero orders.

These show up in Supabase's Table Editor as read-only views Elliott can browse.

## How this is supposed to feel to use

**For a customer:**
1. Lands on keithprints.com, sees the banner and catalog
2. Clicks a product card → detail modal opens with gallery + description
3. Picks a color (and types engraving if applicable), clicks **Add to Cart**
4. Adds more items if they want, then clicks the cart icon (top right) → drawer slides in
5. Reviews cart, hits **Checkout**, redirects to Stripe Checkout
6. Pays, gets redirected to a thank-you page (cart is cleared on success)
7. Receives Stripe's automatic order confirmation email

**For Elliott (operator):**
1. Stripe emails a payment notification, and the webhook auto-writes one `orders` row + N `order_items` rows to Supabase
2. Opens Supabase on phone — finds the new order at status `new`
3. Prints each item on the printer (Keith), packages, ships, updates the parent order's status to `shipped`
4. End of week: opens the `bestsellers` and `monthly_summary` views to see what's selling and how the margin is trending
5. Adds new products via Supabase Table Editor (form view, not raw SQL); edits prices/descriptions/active flags the same way

## Setup steps not in the codebase

These are external services Claude Code cannot configure. Do these in order:

### 1. Supabase project (5 min)
- Create new project at supabase.com (free tier)
- Save the project URL and anon key into `.env.local` (template provided)
- Save the service role key into Vercel env vars later
- Run `supabase/migrations/001_init.sql` in the SQL editor (or via CLI)
- Run `supabase/migrations/002_product_details.sql`
- Run `supabase/migrations/003_multi_item_orders.sql`
- Run `supabase/seed.sql` to load the demo products
- In Authentication → Settings, enable email auth so Elliott can log in to edit products

### 2. Stripe account (10 min)
- Create account at stripe.com (free)
- Get the publishable key (`pk_test_...`) and secret key (`sk_test_...`)
- Set up webhook endpoint pointing to `https://yourdomain.com/api/webhook` with event `checkout.session.completed`
- Save the webhook signing secret (`whsec_...`)
- Stay in test mode (or a Sandbox) until everything is wired up; switch to live keys before launch
- **Each Stripe mode (live / test / each named Sandbox) has its own webhook endpoint and signing secret.** When switching modes, you must create a new webhook in the new mode and update `STRIPE_WEBHOOK_SECRET` in Vercel.

### 3. Vercel deployment (5 min)
- Connect the GitHub repo to Vercel
- Add env vars (see `.env.local.example` for the list)
- Deploy
- Add custom domain if applicable

### 4. First test
- Visit the site, add a product to cart, hit Checkout
- Use Stripe test card `4242 4242 4242 4242` with any future expiry, any CVC
- Confirm webhook fires, order appears in Supabase (`orders` + `order_items`)
- Confirm Stripe receipt email arrives (note: Sandboxes often suppress real emails — only reliable in live mode)

## Things to actively avoid

- **Don't add inventory tracking.** Print-to-order means there's no inventory to track.
- **Don't add user accounts for customers.** Stripe handles email collection; that's enough.
- **Custom admin lives at `/admin`** (added in Phase 1, see scoping decision #8). Don't extend it speculatively — only add what serves day-to-day catalog work. Supabase's Table Editor remains a working fallback for anything the admin UI can't do.
- **Don't add abandoned cart recovery, loyalty programs, or marketing automations.** This is a low-volume hobby shop with bi-annual market peaks. The complexity isn't earned.
- **Don't move to Next.js without a reason.** Vite + vanilla works. Migration would be premature.
- **Don't refactor the design system.** The aesthetic was developed with the owner and is intentional. Don't replace Bungee/Bowlby with Inter, don't replace cream with white, don't soften the chunky borders.
- **Don't drop the printer-as-mascot brand voice.** Customer-facing copy intentionally treats Keith (the printer) as a character ("I'm Keith and I make stuff"). That's a deliberate marketing choice, not a quirk to "fix."

## File map

```
keithprints/
├── CLAUDE.md                    ← you are here
├── README.md                    ← human-facing setup guide
├── package.json
├── vite.config.js
├── .env.local.example
├── .gitignore
├── vercel.json
├── public/
│   ├── banner.jpg               ← THE hero banner, do not replace lightly
│   └── favicon.ico
├── src/
│   ├── main.js                  ← entry point, renders shell + wires cart
│   ├── style.css                ← all styles (no Tailwind, no CSS-in-JS)
│   ├── main.js                  ← public-site entry
│   ├── admin.js                 ← admin-panel entry (loaded only at /admin)
│   ├── lib/
│   │   ├── supabase.js          ← client wrapper
│   │   ├── format.js            ← currency, category labels/gradients
│   │   ├── cart.js              ← cart state (localStorage, pub/sub)
│   │   └── delivery.js          ← local-zone zip eligibility (shared with api/)
│   ├── admin/
│   │   ├── auth.js              ← Supabase auth + TOTP MFA wrapper
│   │   ├── products.js          ← CRUD on products table (admin-only)
│   │   ├── productList.js       ← admin table with search/filter/inline toggles
│   │   └── productForm.js       ← create/edit modal form
│   └── components/
│       ├── catalog.js           ← product grid + filters + search
│       ├── productCard.js
│       ├── productModal.js      ← detail view: gallery, color, customization, Add-to-Cart
│       └── cartDrawer.js        ← slide-out cart with line items + Checkout button
├── api/
│   ├── checkout.js              ← creates Stripe session for full cart
│   └── webhook.js               ← writes parent order + N order_items rows
├── supabase/
│   ├── migrations/
│   │   ├── 001_init.sql                ← creates tables, RLS, views
│   │   ├── 002_product_details.sql     ← gallery_urls + details columns
│   │   ├── 003_multi_item_orders.sql   ← order_items child table + view rewrites
│   │   └── 004_admin_rls_aal2.sql      ← tighten admin RLS to require MFA
│   └── seed.sql                ← demo products to start with
├── docs/
│   ├── SETUP.md                 ← step-by-step external services guide
│   ├── ADDING_PRODUCTS.md       ← how to add products via Supabase Table Editor
│   └── ARCHITECTURE.md          ← deeper-dive for future maintainers
└── index.html
```

## When in doubt

Elliott is the sole operator. Keith is the 3D printer (named, not a person — used as brand persona for customer-facing copy). Decisions should optimize for:

1. Elliott (or any future maintainer) being able to understand and edit the code easily
2. Adding a product never requiring code (Supabase Table Editor only)
3. The site never breaking silently — fail loudly, log clearly
4. Total monthly cost staying under $5 unless real revenue justifies more

If considering a change that increases complexity, ask: "Does this serve a low-volume hobby shop with ~10 sales/month?" If no, don't build it.
