# Setup Guide

This walks you through everything Claude Code can't do for you: creating accounts, getting API keys, and wiring services together. Plan for ~30 minutes total.

**Order matters.** Do these in sequence — Stripe needs Supabase data; Vercel needs both.

---

## 1. Supabase (10 min)

Supabase is your database. Free tier is more than enough.

### Create the project

1. Go to [supabase.com](https://supabase.com), sign up (GitHub login is easiest)
2. Click **New Project**
3. Name it `keithprints` (or whatever)
4. Pick a strong database password — save it in a password manager, you won't need it often
5. Pick the region closest to you
6. Free plan, click **Create new project**
7. Wait ~2 minutes for it to provision

### Run the migrations

Run each of these in the Supabase **SQL Editor** (left sidebar, looks like `>_`), in order:

1. `supabase/migrations/001_init.sql` — creates products, orders, RLS, views
2. `supabase/migrations/002_product_details.sql` — gallery_urls + details columns
3. `supabase/migrations/003_multi_item_orders.sql` — order_items child table + view rewrites
4. `supabase/migrations/004_admin_rls_aal2.sql` — tightens admin RLS to require MFA
5. `supabase/migrations/005_security_hardening.sql` — column-level grants and view ACLs
6. `supabase/migrations/006_storage_policies.sql` — storage bucket RLS

For each: New query → paste contents → **Run**. Each should report "Success. No rows returned."

### Load demo products

1. New query
2. Open `supabase/seed.sql`, copy the contents, paste, click **Run**
3. Should report something like "Success. 30 rows inserted"
4. Click **Table Editor** → `products` → confirm products are there

### Create the storage bucket for product photos

1. **Storage** (left sidebar, folder icon) → **New bucket**
2. Name: `product-images` (must match exactly — migration 006 references this)
3. **Public bucket: ON**
4. Allowed MIME types: `image/png, image/jpeg, image/webp, image/gif`
5. File size limit: 5 MB
6. Save

### Grab your keys

1. **Project Settings** (gear icon) → **API**
2. Copy three values into a notes file:
   - **Project URL** → goes in `VITE_SUPABASE_URL`
   - **anon / public key** → goes in `VITE_SUPABASE_ANON_KEY`
   - **service_role key** (click Reveal) → goes in `SUPABASE_SERVICE_ROLE_KEY`

### Create the admin user

1. **Authentication → Providers** — confirm Email is enabled (default)
2. **Authentication → URL Configuration** — set **Site URL** to your production domain (e.g. `https://www.keithprints.com`). This is used for password-reset email redirects and the MFA issuer label. Don't leave it as `http://localhost:3000`.
3. **Authentication → Users → Add user → Create new user** — your email plus a strong password
4. **Don't** enable MFA in the Supabase UI — the admin app handles enrollment on first login

---

## 2. Stripe (10 min)

Stripe handles payments. The account requires a real business identity for live mode (bank info, tax, etc.) but works in test mode and Sandboxes immediately.

### Create the account

1. Go to [stripe.com](https://stripe.com), click **Start now**
2. Sign up with your email and real name — Stripe verifies identity for payouts
3. Skip business verification for now — test mode works immediately
4. Complete business verification before going live (takes ~1 day, requires bank info)

### Grab your test keys

1. Make sure the dashboard says **Test mode** (orange badge in the top-right) or you're inside a Sandbox
2. **Developers → API keys** (or **Workbench → API keys** in newer UIs)
3. Copy:
   - **Publishable key** (`pk_test_…`) → goes in `VITE_STRIPE_PUBLISHABLE_KEY` *(currently unused by the app since we use Stripe Checkout's hosted flow, but kept in env for future use)*
   - **Secret key** (`sk_test_…`, click Reveal) → goes in `STRIPE_SECRET_KEY`

### Enable customer receipts

Settings → Branding → **Customer Emails** → toggle **Successful payments** ON. This sends Stripe's branded receipt to the customer after each order.

(In a Sandbox, outbound emails are typically suppressed regardless of this toggle. The setting matters in test mode and live mode.)

### Webhook (after first deploy — see step 3)

You need a deployed URL before the webhook is useful. Come back here after step 3.

**Critical:** each Stripe mode (test, live, every named Sandbox) has its own webhook endpoints and signing secrets. When switching modes (e.g., test → live for launch), you create a new webhook in the new mode and update `STRIPE_WEBHOOK_SECRET` in Vercel accordingly.

---

## 3. Vercel (10 min)

Vercel hosts the site and runs the API functions.

### Push to GitHub first

Push the repo to your own GitHub. Personal account is recommended (Vercel charges for private *organization* repo deploys; private personal repos are free on Hobby).

### Connect to Vercel

1. Go to [vercel.com](https://vercel.com), sign up — easiest is **Continue with GitHub** using the same GitHub account that owns the repo
2. Click **Add New → Project**
3. Import the `keithprints` repo
4. Vercel auto-detects Vite — leave the build settings as default
5. Before deploying, expand **Environment Variables** and add:

| Name | Value | Where it comes from |
|---|---|---|
| `VITE_SUPABASE_URL` | from Supabase | Step 1 |
| `VITE_SUPABASE_ANON_KEY` | from Supabase | Step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase | Step 1 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | from Stripe | Step 2 |
| `STRIPE_SECRET_KEY` | from Stripe | Step 2 |
| `STRIPE_WEBHOOK_SECRET` | (filled in step 4) | Leave blank for now |
| `SITE_URL` | your production URL, e.g. `https://www.keithprints.com` | After first deploy |

Set each var for **Production, Preview,** and **Development**.

6. Click **Deploy**, wait ~2 minutes, visit your URL

### Update SITE_URL with the real URL

After the first deploy:

1. Vercel → your project → **Settings → Environment Variables**
2. Edit `SITE_URL` to your production URL (or custom domain if you've added one)
3. **No trailing slash, no whitespace** — the value must look exactly like `https://www.keithprints.com`
4. **Deployments** → top deployment → **⋯** → **Redeploy**

---

## 4. Stripe webhook (5 min)

Now that you have a deployed URL, finish the Stripe setup.

1. Stripe → **Workbench → Webhooks → Create an event destination**
2. Endpoint URL: `https://YOUR-DOMAIN/api/webhook`
3. Events to listen for: `checkout.session.completed`
4. Save
5. Click into the new endpoint → **Reveal** under signing secret → copy the `whsec_…` value
6. Vercel → **Environment Variables** → edit `STRIPE_WEBHOOK_SECRET` → paste it
7. Redeploy

---

## 5. Test the full flow

1. Visit your live site, add a product to cart, click Checkout
2. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any zip
3. Complete the purchase
4. You should redirect back to the site with a success toast and the cart cleared
5. Check Supabase → **Table Editor** → `orders` → your test order should be there as one row, with matching rows in `order_items`
6. Stripe → **Payments** → your test payment should be there

If the order doesn't appear in Supabase, check Vercel **Logs** for `/api/webhook` errors.

---

## 6. Going live (when ready)

When you're ready to take real orders:

1. Stripe → finish business verification (bank info, identity, etc.)
2. Switch the dashboard out of test mode / sandbox into live mode
3. Get NEW api keys (live keys differ from test keys)
4. Get a NEW webhook signing secret from a NEW webhook endpoint in live mode pointing to the same `/api/webhook` URL
5. Update all four Stripe env vars in Vercel with the live values:
   - `VITE_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
6. Redeploy

---

## 7. First admin login (after deploy)

1. Visit `https://YOUR-DOMAIN/admin`
2. Sign in with the Supabase user you created in step 1
3. The MFA enrollment screen appears: scan the QR with Authy / 1Password / Google Authenticator
4. Save the secret in your password manager as backup
5. Enter the 6-digit code → enrolled
6. You land in the admin product list

Future logins prompt for the 6-digit code only (after email + password).

---

## Cost summary

After setup:

- **Supabase**: $0/month (free tier)
- **Vercel**: $0/month (free tier)
- **Stripe**: 2.9% + 30¢ per successful payment, no monthly fee
- **Domain**: ~$12/year if you want a custom domain (optional)

Total fixed cost: $0/month + ~$12/year for a custom domain.

---

## Domain setup (optional)

1. Buy the domain from any registrar (Cloudflare, Namecheap, Porkbun all good — avoid GoDaddy)
2. Vercel → your project → **Settings → Domains → Add**
3. Enter your domain, follow Vercel's DNS instructions
4. Update `SITE_URL` env var to the new domain
5. Update the Stripe webhook URL to use the new domain
6. Redeploy

---

## Common issues

**Site loads but no products show.** Browser DevTools console → check for Supabase errors. Likely either env vars are wrong, a migration didn't run, or the seed.sql wasn't loaded.

**Checkout button does nothing or returns 500.** Vercel **Logs** → filter `/api/checkout` → look for the most recent error message. Most common: `SITE_URL` missing, malformed, or has a trailing slash; or Stripe key is in the wrong mode.

**Stripe checkout opens but the webhook doesn't write to Supabase.** Verify the webhook endpoint is configured **in the same Stripe mode you're testing in** (test vs. live vs. sandbox each have their own webhook list). Confirm `STRIPE_WEBHOOK_SECRET` matches the active mode's signing secret.

**Stripe redirects back with "Your card was declined. Your request was in live mode, but used a known test card."** Your Stripe keys are live mode but you're using a test card. Switch keys to test mode (or run the test in a sandbox).

**RLS / permission errors in console.** Verify all six migrations ran successfully — open Supabase **Table Editor**, you should see `products`, `orders`, `order_items`. The Database → Policies tab should show entries.
