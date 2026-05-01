# Setup Guide

This walks you through everything Claude Code can't do for you: creating accounts, getting API keys, and wiring services together. Plan for ~30 minutes total.

**Order matters.** Do these in sequence — Stripe needs Supabase data; Vercel needs both.

---

## 1. Supabase (10 min)

Supabase is your database. Free tier is more than enough for this project.

### Create the project

1. Go to [supabase.com](https://supabase.com), sign up (GitHub login is easiest)
2. Click **New Project**
3. Name it `keithprints` (or whatever)
4. Pick a strong database password — save it in a password manager, you won't need it often
5. Pick the region closest to you
6. Free plan, click **Create new project**
7. Wait ~2 minutes for it to provision

### Run the schema

1. In the Supabase dashboard, open the **SQL Editor** (left sidebar, looks like `>_`)
2. Click **New query**
3. Open `supabase/migrations/001_init.sql` from this repo, copy the entire contents
4. Paste into the editor, click **Run**
5. Should say "Success. No rows returned"

### Load demo products

1. New query
2. Open `supabase/seed.sql`, copy the contents
3. Paste, click **Run**
4. Should say "Success. 30 rows inserted" (or however many products are in seed.sql)
5. Click **Table Editor** in the sidebar → `products` → confirm products are there

### Grab your keys

1. Go to **Project Settings** (gear icon) → **API**
2. Copy three things into a notes file:
   - **Project URL** → goes in `VITE_SUPABASE_URL`
   - **anon / public key** (under "Project API keys") → goes in `VITE_SUPABASE_ANON_KEY`
   - **service_role key** (click "Reveal") → goes in `SUPABASE_SERVICE_ROLE_KEY`

### Enable auth (so Keith and Mom can log in to edit)

1. Go to **Authentication** → **Providers**
2. Make sure **Email** is enabled (it is by default)
3. Go to **Authentication** → **Users** → **Add user** → **Create new user**
4. Enter Mom's email and a password — she'll log in to Supabase to add products
5. Repeat for Keith if he wants direct access

---

## 2. Stripe (10 min)

Stripe handles payments. Account creation requires the holder to be 18+, so use Mom's name.

### Create the account

1. Go to [stripe.com](https://stripe.com), click **Start now**
2. Use Mom's email and real name — Stripe verifies identity
3. **You can skip business verification for now** — the account works in test mode immediately
4. You'll need to complete business verification before going live (takes ~1 day, requires bank info)

### Grab your test keys

1. Make sure the dashboard toggle (top right) says **Test mode** (orange)
2. Go to **Developers** → **API keys**
3. Copy:
   - **Publishable key** (`pk_test_...`) → goes in `VITE_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** (`sk_test_...`, click reveal) → goes in `STRIPE_SECRET_KEY`

### Set up the webhook (after deploying — see step 3 below)

You need a deployed URL before you can configure the webhook. Come back here after step 3.

---

## 3. Vercel (10 min)

Vercel hosts the site and runs the API functions.

### Push to GitHub first

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create keithprints --private --source=. --remote=origin --push
# OR manually create the repo on github.com and push
```

### Connect to Vercel

1. Go to [vercel.com](https://vercel.com), sign up with GitHub
2. Click **Add New** → **Project**
3. Import your `keithprints` repo
4. Vercel auto-detects Vite — leave the build settings as default
5. **Before deploying**, expand **Environment Variables** and add ALL of these:

| Name | Value | Where to find |
|---|---|---|
| `VITE_SUPABASE_URL` | from Supabase | Step 1 |
| `VITE_SUPABASE_ANON_KEY` | from Supabase | Step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase | Step 1 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | from Stripe | Step 2 |
| `STRIPE_SECRET_KEY` | from Stripe | Step 2 |
| `STRIPE_WEBHOOK_SECRET` | (you'll get this in step 4) | Leave blank for now, fill in after |
| `SITE_URL` | your Vercel URL (e.g. `https://keithprints.vercel.app`) | After first deploy |

6. Click **Deploy**
7. Wait ~2 minutes
8. Visit your URL — you should see the catalog!

### Update SITE_URL with the real URL

After the first deploy, copy the production URL Vercel gives you (e.g. `https://keithprints-xyz.vercel.app`) and:

1. Vercel dashboard → your project → **Settings** → **Environment Variables**
2. Edit `SITE_URL` to that URL
3. Click **Deployments** → top deployment → **⋯** → **Redeploy**

---

## 4. Stripe webhook (5 min)

Now that you have a deployed URL, finish the Stripe setup.

1. In Stripe dashboard, go to **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL: `https://YOUR-VERCEL-URL.vercel.app/api/webhook`
3. Under **Events to send**, click **Select events** and add:
   - `checkout.session.completed`
4. Click **Add endpoint**
5. On the webhook detail page, click **Reveal** under **Signing secret**
6. Copy this value (starts with `whsec_...`)
7. Back in Vercel → **Environment Variables** → edit `STRIPE_WEBHOOK_SECRET` → paste it
8. Redeploy (Deployments → top deployment → ⋯ → Redeploy)

---

## 5. Test the full flow

1. Visit your live site
2. Click any product → pick a color → **Buy Now**
3. You'll redirect to Stripe Checkout
4. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC, any zip
5. Complete the purchase
6. You should redirect back to the site with a success toast
7. Check Supabase → **Table Editor** → `orders` → your test order should be there
8. Check Stripe → **Payments** → your test payment should be there

If the order doesn't appear in Supabase, check Vercel **Functions** logs for webhook errors.

---

## 6. Going live (when ready)

When you're ready to take real orders:

1. Stripe → finish business verification (bank info, identity, etc.)
2. Stripe → flip the **Test mode** toggle to **Live mode**
3. Get NEW api keys (live mode keys are different from test keys)
4. Get a NEW webhook signing secret (from a NEW webhook endpoint pointing to your same URL)
5. Update all four Stripe env vars in Vercel with the live values
6. Redeploy

---

## Cost summary

After setup:

- **Supabase**: $0/month (free tier covers this)
- **Vercel**: $0/month (free tier covers this)
- **Stripe**: 2.9% + 30¢ per successful payment, no monthly fee
- **Domain**: ~$12/year if you want a custom domain (optional — `keithprints.vercel.app` works fine)

Total fixed cost: $0/month + $12/year if you buy a domain.

---

## Domain setup (optional)

If you want `keithprints.com` instead of `keithprints.vercel.app`:

1. Buy the domain from any registrar (Cloudflare, Namecheap, Porkbun all good — avoid GoDaddy)
2. Vercel dashboard → your project → **Settings** → **Domains** → **Add**
3. Enter your domain, follow Vercel's DNS instructions
4. Update `SITE_URL` env var to the new domain
5. Update the Stripe webhook URL to use the new domain
6. Redeploy

---

## Common issues

**Site loads but no products show.** Check browser DevTools console. Likely either Supabase env vars are wrong or you didn't run the seed.sql file.

**"Buy Now" button does nothing.** Open DevTools → Network tab → click Buy Now → look for `/api/checkout` request. If 500 error, check Vercel function logs.

**Stripe checkout opens but doesn't redirect back.** Check `SITE_URL` env var matches your actual deployed URL.

**Order doesn't appear in Supabase after purchase.** Check Vercel function logs for `/api/webhook`. Most common cause: `STRIPE_WEBHOOK_SECRET` env var doesn't match what Stripe is sending.

**RLS policy error in console.** Verify migration ran successfully — open Supabase Table Editor, you should see both `products` and `orders` tables, and the policies tab should show entries.
