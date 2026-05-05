# Adding & Editing Products

Day-to-day catalog management happens at `/admin` — a custom panel built into the site that handles products, photos, and order status without leaving the admin login.

Supabase's Table Editor remains a working fallback for anything the admin panel can't do (e.g., bulk SQL operations).

---

## Logging in

1. Go to `https://YOUR-DOMAIN/admin`
2. Enter your email + password (the Supabase user created during setup)
3. Enter the 6-digit code from your authenticator app
4. You land on the product list

If MFA isn't enrolled yet, the first login walks you through scanning a QR with Authy / 1Password / Google Authenticator. Save the secret in your password manager as a backup.

---

## The product list

The main admin view is a table of every product (active and inactive). For each row:

- **Search** by name or slug (top-left search box)
- **Filter** by category (dropdown)
- **Margin** column color-coded — green ≥60%, orange ≥30%, magenta below
- **Active** toggle — flip OFF to hide from the public catalog (with a confirmation prompt). Flip ON to show again (no prompt — going active is low-risk).
- **Featured** toggle — adds a soft visual emphasis on the public site
- **Badge** dropdown — choose `new`, `hot`, `fav`, or none. Overrides the featured-only treatment.
- **Edit** link or click anywhere on the row → opens the full edit form
- **Delete** link → hard-deletes after confirmation. Prefer toggling `active` off if you might want it back.

A row count above the table shows how many of the total are visible after filters.

---

## Adding a new product

1. Click **+ New Product** (top-right of the toolbar)
2. The form opens. Required fields are marked with `*`:
   - **Name** — what customers see
   - **Slug** — URL-friendly. Auto-generated from name as you type; click in the slug field to customize
   - **Category** — keychains / fidgets / figurines / ornaments / more
   - **Sale price (USD)** — what you charge. Letters are stripped automatically.
   - **Unit cost (USD)** — your filament + electricity per print. **PRIVATE** — never shown to customers. Used for margin reporting.
3. Optional but recommended:
   - **Short description** — one-liner shown on cards
   - **Long details** — the longer copy in the product detail modal. Falls back to short description when empty.
   - **Primary image** — drag-drop or click the drop zone. Auto-uploads to Supabase Storage; thumbnail appears when done. PNG / JPEG / WEBP / GIF, max 5 MB.
   - **Gallery images** — additional photos shown alongside the primary. Drop multiple at once.
   - **Colors** — comma-separated list (e.g. `Blue, Red, Black, Glow`). Customers pick one at checkout.
   - **Customizable** — check this if customers can engrave/customize. Reveals two more fields:
     - **Customization label** — e.g. "Engrave a name (max 8 chars)"
     - **Max characters** — limits the engraving input
   - **Print time (hours)** — surfaced as a chip in the detail modal ("🖨 ~6h print"). Customers see this; also useful for your scheduling.
   - **Badge** — `new`, `hot`, or `fav`. Or none.
   - **Active** — checked by default. Uncheck to create as hidden.
   - **Featured** — adds emphasis on the public site
   - **Display order** — sort key within the category (lower = earlier). Default 0.
4. Click **Create Product**
5. The product appears in the table and on the public site within seconds

---

## Editing a product

1. Click any row in the admin table → the edit form opens with current values
2. Change what you want
3. Click **Save Changes**

The detail modal on the public site updates immediately. Changes to price, name, etc. apply going forward — historical orders still show the price they were sold at (snapshotted in `order_items`).

---

## Hiding a product without deleting it

Toggle the **Active** column off in the admin table. The product disappears from the public catalog but you keep all its order history. You can toggle it back on any time.

This is almost always preferable to deleting. If you delete a product, the link from old `order_items` rows is set to null — you keep the order history but lose the connection to the live product.

---

## Adding photos

Drag-drop into the form's drop zones, or click to open the file picker. Files upload to the `product-images` Supabase Storage bucket; the public URL is stored on the product. The public site loads the image directly from Supabase's CDN.

Images you remove from the form aren't auto-deleted from storage — they become orphaned. At this scale, the disk waste is negligible. Periodic cleanup can happen via the Supabase Storage UI later.

**Image tips:**
- Square aspect ratio (1:1) looks best on the catalog cards
- 600 × 600 px minimum, 1200 × 1200 px is a good ceiling
- JPG for photos, PNG if you need transparency
- Compress before uploading (e.g., [squoosh.app](https://squoosh.app), free)

---

## Adjusting prices

1. Click the row, edit **Sale price** in the form, save.
2. Past orders keep their old price. The `order_items` table snapshots `sale_price_cents` and `unit_cost_cents` at sale time, so your historical revenue/profit reports stay accurate.

---

## Looking at sales

The `/admin` panel covers product management. For sales analytics, use Supabase's read-only views in the Table Editor:

### Bestsellers

1. Supabase → **Database → Views**
2. Open `bestsellers`
3. Sorted automatically by units sold

You see: name, category, units sold, revenue, profit, and margin per product.

### Monthly summary

1. Same place: **Database → Views → `monthly_summary`**
2. Total revenue, cost, profit, and margin per month

### Unsold products

1. **Database → Views → `unsold_products`**
2. Active products with zero sales — candidates for retirement or a marketing push

These views require an MFA-verified login on the Supabase dashboard side. The dashboard's internal admin role bypasses the AAL2 RLS, so they're available there even without going through `/admin`.

---

## Managing orders

Orders are not yet editable from `/admin` — that's still done in Supabase's Table Editor.

1. Supabase → **Table Editor → orders**
2. Each row is one customer checkout. Drill into a row to see the matching `order_items` rows (the actual products bought).
3. Important fields:
   - `status` — change as you progress: `new` → `printing` → `shipped`
   - `notes` — free-form notes (filament color, special instructions, tracking number, etc.)
   - `customer_email` — Stripe collected this; you can reply to update status manually
   - `shipping_address` — JSON; click to expand
   - `delivery_method` — `shipping` (standard) or `local` (free local pickup/delivery for the configured zips)
   - `subtotal_cents` / `shipping_cents` / `total_cents` — amounts in cents

### Filtering orders

- Click **Filter** at the top of the table
- Add filter: `status` equals `new` to see only orders that need printing
- Save the filter as a view

---

## Common workflow

**When you have orders:**
1. Open Supabase on your phone → `orders` table → look for `status = new`
2. Find the matching `order_items` rows for each new order to see what to print
3. Print the items, mark `status = printing` while printing
4. Once shipped, set `status = shipped`, paste the tracking number in `notes`
5. Stripe sends customers a receipt automatically — no need to email separately

**Weekly:**
1. `bestsellers` view to see what's selling
2. `unsold_products` for retirement candidates
3. Add new products via `/admin` as needed

**Monthly:**
1. `monthly_summary` for revenue / profit
2. Adjust prices via `/admin` if margins drifted
3. Plan filament inventory based on what's been selling

---

## Need to delete something?

Generally don't. Use **Active = off** to hide products. For orders, set `status = cancelled` rather than deleting — it preserves the financial record.

If you really need to delete a product, use the **Delete** link in the admin table (with confirmation). Old order_items rows lose the product link but keep the snapshotted name and price.

---

## Backup

Supabase auto-backs up the database daily on the free tier. If something goes badly wrong, contact Supabase support — they can restore.

For peace of mind, you can export to CSV any time:
1. Open any table in Supabase
2. Click **Download as CSV** in the top right
