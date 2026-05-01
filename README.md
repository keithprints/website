# Keith Prints

Kid-run 3D printing shop website. Vite + Vanilla JS + Supabase + Stripe + Vercel.

## Quick start (deploy this afternoon)

You need three accounts: **Supabase**, **Stripe**, **Vercel**. All free tiers. See `docs/SETUP.md` for the detailed walkthrough — this README is the speedrun.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.local.example .env.local
# Edit .env.local with your Supabase + Stripe keys

# 3. Set up the database
# Open Supabase → SQL Editor → paste supabase/migrations/001_init.sql → Run
# Then paste supabase/seed.sql → Run

# 4. Develop locally
npm run dev

# 5. Deploy
npx vercel
# Add env vars in Vercel dashboard, redeploy
```

## What this is

A simple online catalog so Keith (12) can take orders between his bi-annual market appearances. Print-to-order, no inventory tracking, single-item checkout via Stripe.

**Key files to read first:**
- `CLAUDE.md` — full project context, stack decisions, what NOT to build
- `docs/SETUP.md` — step-by-step external service setup
- `docs/ADDING_PRODUCTS.md` — how to add/edit products via Supabase

## Total cost

- Domain: ~$12/year
- Everything else: $0/month + Stripe's 2.9% + 30¢ per sale

## Editing products

Don't edit JSON files. Open Supabase → Table Editor → `products`. Add a row, fill in the fields, save. Site updates immediately.

See `docs/ADDING_PRODUCTS.md` for the cookbook.

## Tech notes

- **No build step required for development** — Vite handles HMR
- **Vercel serverless functions** in `/api` handle Stripe (Node.js runtime)
- **Supabase RLS** keeps `unit_cost_cents` private from the public site
- **No React.** Vanilla JS. Don't add a framework without strong reason.
