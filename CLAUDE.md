# Keith Prints — Project Memory for Claude Code

## What this is

Keith Prints is a small e-commerce website for a 12-year-old's 3D printing business. He prints keychains, fidgets, figurines, and ornaments and sells them at a bi-annual local market. This site exists to capture sales between markets — typically a few orders per month at peak, sometimes zero. It is **not** a high-volume shop and should not be over-engineered for scale.

The brand voice is "kid-run, kid-honest, late elementary/middle school." Chunky display type, neon accents on a warm cream background, sticker-pop drop shadows. The hero banner is a hero asset — keep it prominent. Voice is direct and a little cheeky, never babyish ("Cool things. 3D printed. Just for you.").

## The stack

| Layer | Service | Free tier sufficient? |
|---|---|---|
| Frontend | Vite + vanilla JS (no React) hosted on Vercel | Yes |
| Database | Supabase (Postgres) | Yes — 500MB DB, plenty for this |
| Payments | Stripe Checkout (hosted) via Vercel serverless function | Pay-per-transaction only |
| Email | Stripe sends order emails to Keith automatically | N/A |
| DNS | Owner provides own domain (~$12/yr) | N/A |

**Why no React:** the demo site is ~250 lines of vanilla JS with no build step requirements. Adding React/Next would multiply the surface area for a site with maybe 50 product cards and one checkout button. Vite + plain JS keeps the deploy fast, the code grokkable, and lets Keith eventually understand his own site.

**Why Supabase over Airtable:** Owner explicitly chose Supabase. Real Postgres, free tier covers needs, has built-in admin UI (Table Editor) that's nearly as easy as Airtable for non-technical editors. Bonus: row-level security means we can expose public product data via the anon key without leaking cost/profit fields.

## Critical scoping decisions (don't undo these)

These are decisions that emerged from a long conversation with the owner. Re-litigating them wastes time:

1. **Print-to-order. No inventory tracking.** Every sale assumes Keith will print after the order arrives. No stock counts, no "sold out" states, no decrements, no race conditions to worry about. The website tells customers "ships within a week" because that's how long printing takes.

2. **Single product table is fine.** No separate variants table. Colors are a `text[]` array on the product itself. If color-specific pricing or images ever becomes a need, split it then. Today, a customer picks a color from a dropdown and that selection rides along with the order.

3. **Cart-based checkout.** Customers add items to a slide-out cart (state lives in `localStorage`, no auth needed) and check out once with all of them. State seeded `kp_cart_v1`. *(Originally scoped as "no cart, single-item Buy Now" — reversed 2026-05-04 after observing the friction of forcing customers through Stripe Checkout once per item.)*

4. **Profit/cost data lives in the same products table but is gated by RLS.** The `unit_cost` field is private. Public site never sees it. Keith and his mom see it via Supabase auth.

5. **Order history is the financial source of truth.** Every Stripe webhook writes one parent `orders` row plus one `order_items` row per cart line, snapshotting price and unit cost AT THE TIME OF SALE. Don't reference live product fields for historical analysis — prices change, snapshots don't.

6. **No automation Keith could do manually in 10 seconds.** When an order arrives, Stripe emails him. He prints, ships, marks the order `shipped` in Supabase. Don't build label printing, automated tracking emails, or shipping integrations until volume justifies it.

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
| `print_time_hours` | `numeric(4,1)` | Surfaced as a chip in the detail modal ("🖨 ~6h print") and used for Keith's planning |
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
| `delivery_method` | `text` default `'shipping'` | `shipping` / `local`. Used by future local-delivery zip gating |
| `subtotal_cents` | `int` | Sum of (sale_price × qty) across order_items |
| `shipping_cents` | `int` default 0 | Stripe-computed shipping charge |
| `total_cents` | `int` | Stripe `amount_total` |
| `status` | `text` default 'new' | new / printing / shipped / cancelled |
| `notes` | `text` | Keith's free-form notes |
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

- `products` table: anon role can `SELECT` columns `id, name, slug, description, details, category, image_url, gallery_urls, colors, customizable, customization_label, customization_max_chars, sale_price_cents, print_time_hours, featured, badge, display_order` WHERE `active = true`. Authenticated role (Keith/Mom) can do everything. (Column visibility is enforced in `src/lib/supabase.js`'s explicit SELECT — RLS is row-level only.)
- `orders` and `order_items` tables: anon role gets nothing. Authenticated role does everything.
- Service role (used by webhook function only) bypasses RLS.

The public website uses the `anon` key. The webhook function uses the `service_role` key (set as a Vercel env var, never exposed to the browser).

### Useful Supabase views (created in migration)

- `bestsellers` — products joined with order counts and revenue, sorted by units sold desc.
- `monthly_summary` — revenue, cost, profit, margin grouped by month.
- `unsold_products` — active products with zero orders.

These show up in Supabase's Table Editor as read-only views Keith can browse.

## How this is supposed to feel to use

**For a customer:**
1. Lands on keithprints.com, sees the banner and catalog
2. Clicks a product card → detail modal opens with gallery + description
3. Picks a color (and types engraving if applicable), clicks **Add to Cart**
4. Adds more items if they want, then clicks the cart icon (top right) → drawer slides in
5. Reviews cart, hits **Checkout**, redirects to Stripe Checkout
6. Pays, gets redirected to a thank-you page (cart is cleared on success)
7. Receives Stripe's automatic order confirmation email

**For Keith:**
1. Stripe sends an email summarizing the order
2. Opens Supabase on his phone — `orders` row plus matching `order_items` rows, status = "new"
3. Prints each item, ships, updates the parent order's status = "shipped"
4. End of week: opens the `bestsellers` view to see what's selling

**For owner (Elliott) and Keith's mom:**
1. Add new products via Supabase Table Editor (form view, not raw SQL)
2. Edit prices/descriptions/active flags the same way
3. Check the `monthly_summary` view for financial overview

## Setup steps not in the codebase

These are external services Claude Code cannot configure. Do these in order:

### 1. Supabase project (5 min)
- Create new project at supabase.com (free tier)
- Save the project URL and anon key into `.env.local` (template provided)
- Save the service role key into Vercel env vars later
- Run `supabase/migrations/001_init.sql` in the SQL editor (or via CLI)
- Run `supabase/seed.sql` to load the demo products
- In Authentication → Settings, enable email auth so Keith and Mom can log in to edit

### 2. Stripe account (10 min)
- Create account at stripe.com (free, must be 18+ — use parent's name)
- Get the publishable key (`pk_test_...`) and secret key (`sk_test_...`)
- Set up webhook endpoint pointing to `https://yourdomain.com/api/webhook` with event `checkout.session.completed`
- Save the webhook signing secret (`whsec_...`)
- Stay in test mode until everything is wired up; switch to live keys before launch

### 3. Vercel deployment (5 min)
- Connect the GitHub repo to Vercel
- Add env vars (see `.env.local.example` for the list)
- Deploy
- Add custom domain if applicable

### 4. First test
- Visit the site, click Buy Now on any product
- Use Stripe test card `4242 4242 4242 4242` with any future expiry, any CVC
- Confirm webhook fires, order appears in Supabase
- Confirm Stripe receipt email arrives

## Things to actively avoid

- **Don't add inventory tracking.** Print-to-order means there's no inventory to track.
- **Don't add user accounts for customers.** Stripe handles email collection; that's enough.
- **Don't add an admin UI.** Supabase's Table Editor IS the admin UI. Building one in-app is wasted effort.
- **Don't add abandoned cart recovery, loyalty programs, or marketing automations.** This is a kid's hobby business with bi-annual market peaks. The complexity isn't earned.
- **Don't move to Next.js without a reason.** Vite + vanilla works. Migration would be premature.
- **Don't refactor the design system.** The aesthetic was developed in collaboration with the owner and is intentional. Don't replace Bungee/Bowlby with Inter, don't replace cream with white, don't soften the chunky borders.

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
│   ├── lib/
│   │   ├── supabase.js          ← client wrapper
│   │   ├── format.js            ← currency, category labels/gradients
│   │   └── cart.js              ← cart state (localStorage, pub/sub)
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
│   │   └── 003_multi_item_orders.sql   ← order_items child table + view rewrites
│   └── seed.sql                ← demo products to start with
├── docs/
│   ├── SETUP.md                 ← step-by-step external services guide
│   ├── ADDING_PRODUCTS.md       ← how Keith/Mom add products via Supabase
│   └── ARCHITECTURE.md          ← deeper-dive for future maintainers
└── index.html
```

## When in doubt

The owner is Elliott. Keith is 12. Decisions should optimize for:
1. Keith being able to understand and eventually maintain parts of this himself
2. Mom being able to add a product without writing code
3. The site never breaking silently — fail loudly, log clearly
4. Total monthly cost staying under $5 unless real revenue justifies more

If considering a change that increases complexity, ask: "Does this serve a kid running a hobby print shop with ~10 sales/month?" If no, don't build it.
