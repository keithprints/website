# Keith Prints

E-commerce website for a small 3D-printing shop. Vite + Vanilla JS + Supabase + Stripe + Vercel. The "Keith" in the name is the printer (used as a brand mascot in customer-facing copy); the operator handles all printing, fulfillment, and admin.

## Quick start

You need three accounts: **Supabase**, **Stripe**, **Vercel**. All free tiers. See [`docs/SETUP.md`](docs/SETUP.md) for the click-by-click walkthrough.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.local.example .env.local
# Fill in Supabase + Stripe keys

# 3. Set up the database — run each migration in Supabase SQL Editor, in order:
#    supabase/migrations/001_init.sql
#    supabase/migrations/002_product_details.sql
#    supabase/migrations/003_multi_item_orders.sql
#    supabase/migrations/004_admin_rls_aal2.sql
#    supabase/migrations/005_security_hardening.sql
#    supabase/migrations/006_storage_policies.sql
# Then load demo products: supabase/seed.sql

# 4. Develop locally
npm run dev

# 5. Deploy
npx vercel
# Add env vars in Vercel dashboard, redeploy
```

## What this is

A small online catalog for a hobby 3D-printing shop — keychains, fidgets, figurines, ornaments. Print-to-order, no inventory tracking, multi-item cart, Stripe Checkout, admin panel at `/admin` with email + TOTP MFA.

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) — first-time setup of Supabase, Stripe, and Vercel
- [`docs/ADDING_PRODUCTS.md`](docs/ADDING_PRODUCTS.md) — day-to-day catalog management via `/admin`
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit, for future maintainers

## Cost

- Domain: ~$12/year
- Everything else: $0/month + Stripe's 2.9% + 30¢ per sale (no monthly fee)

## Editing products

Sign in at `/admin` with your Supabase credentials and TOTP code. The product table supports search, filter by category, inline toggles for active/featured/badge, and a full edit form with drag-drop photo upload. See [`docs/ADDING_PRODUCTS.md`](docs/ADDING_PRODUCTS.md).

Supabase's Table Editor remains a working fallback (the dashboard's internal admin role bypasses RLS).

## Tech notes

- **No build step required for development** — Vite handles HMR
- **Vercel serverless functions** in `/api` handle Stripe (Node.js runtime)
- **Supabase RLS + column grants** keep `unit_cost_cents` and order data private from the public site
- **MFA-gated admin writes** — RLS on `products`/`orders`/`order_items` requires AAL2 (TOTP-verified session)
- **No React.** Vanilla JS. Don't add a framework without strong reason.
