# Adding & Editing Products

This is the day-to-day guide for Keith and Mom. No code required.

## Logging in

1. Go to [supabase.com](https://supabase.com)
2. Sign in with the email/password Mom set up
3. Click the `keithprints` project

## Adding a new product

1. Click **Table Editor** (left sidebar, looks like a grid)
2. Click `products` in the table list
3. Click **Insert** → **Insert row** (top right)
4. Fill out the form. Required fields:
   - **name** — what customers see ("Wolf Keychain")
   - **slug** — URL-friendly version, lowercase, dashes ("wolf-keychain")
   - **category** — pick one: keychains, fidgets, figurines, ornaments, more
   - **sale_price_cents** — IMPORTANT: this is in CENTS. $8.00 = `800`. $12.50 = `1250`
   - **unit_cost_cents** — your cost in cents (filament + electricity per print)
5. Optional but recommended:
   - **description** — short blurb (under 100 characters works best)
   - **image_url** — link to a product photo (see below)
   - **colors** — list of available colors. Click the field, type each color and hit enter. Example: `Blue`, `Red`, `Black`
   - **customizable** — check this box if customers can engrave/customize
   - **customization_label** — only if customizable. Example: "Engrave a name (max 8 chars)"
   - **customization_max_chars** — only if customizable. Default 8
   - **print_time_hours** — for Keith's planning, not shown to customers
   - **badge** — `new`, `hot`, or `fav` to show a badge on the card
   - **display_order** — number to control sort order within category (lower = earlier)
6. Click **Save**
7. The product shows up on the website within seconds. Refresh to see it.

## Editing a product

1. Open the `products` table
2. Find the row, click any cell to edit it
3. Most fields edit inline (just type and hit enter)
4. For complex fields (colors, description), click the expand icon to open the editor
5. Changes save automatically

## Hiding a product without deleting it

1. Open the row
2. Set `active` to `false`
3. Save
4. The product disappears from the website but you keep all its order history

This is better than deleting — if you delete a product, the orders table loses the link.

## Adding product images

The seed data leaves `image_url` empty (you'll see emoji placeholders on the site). Two options:

**Option A: Use Supabase Storage (recommended)**

1. Click **Storage** in the left sidebar
2. Create a bucket called `product-images` if it doesn't exist
3. Upload your product photos
4. After upload, click each image → copy the public URL
5. Paste the URL into the product's `image_url` field

**Option B: Use any image host**

If you already host images on Imgur, Cloudinary, or your own server, just paste the direct URL into `image_url`. Must end in `.jpg`, `.png`, etc.

**Image tips:**
- Square aspect ratio (1:1) looks best in the cards
- 600x600px minimum, 1200x1200px maximum
- JPG for photos, PNG if you need transparency
- Compress before uploading (use squoosh.app — free)

## Adjusting prices

1. Open the row
2. Edit `sale_price_cents` (remember: cents! 800 = $8.00)
3. Save

**Important:** Past orders keep the old price. The `orders` table snapshots the price at the time of sale, so historical revenue stays accurate.

## Looking at sales

### Bestsellers

1. Click **Database** in the left sidebar → **Views**
2. Open `bestsellers`
3. Sorted automatically by units sold

You see: name, category, units sold, revenue, profit, and margin per product.

### Monthly summary

1. Same place: **Database** → **Views** → `monthly_summary`
2. Shows total revenue, cost, profit, and margin per month

### Unsold products

1. **Database** → **Views** → `unsold_products`
2. Lists active products with zero sales — candidates for retirement or marketing push

## Managing orders

1. Click **Table Editor** → `orders`
2. Each row is one sale
3. Important fields:
   - `status` — change as you progress: `new` → `printing` → `shipped`
   - `notes` — your free-form notes (filament color, special instructions, etc.)
   - `customer_email` — email Stripe collected; you can reply to update status
   - `shipping_address` — click to expand the JSON; that's where it goes

### Filtering orders

- Click the **Filter** button (top of table)
- Add filter: `status` equals `new` to see only orders that need printing
- Save the filter as a view by clicking the **Save** icon

## Common workflow

**Daily (when you have orders):**
1. Open Supabase on your phone, check `orders` table for `status = new`
2. Print the items
3. Update `status` to `printing` while printing
4. Once shipped, update `status` to `shipped` and add the tracking number to `notes`
5. Stripe sends customers a receipt automatically — no need to email separately

**Weekly:**
1. Check the `bestsellers` view to see what's selling
2. Check `unsold_products` for things to retire or revamp
3. Add 1-2 new product ideas

**Monthly:**
1. Check `monthly_summary` for revenue/profit
2. Decide if any prices need adjusting
3. Plan inventory for the next market based on what's been selling

## Need to delete something?

Generally don't. Use `active = false` to hide products. For orders, use `status = cancelled` rather than deleting.

If you really need to delete, click the row, click the trash icon, confirm.

## Backup

Supabase auto-backs up the database daily on the free tier. If you ever screw something up badly, contact support — they can restore.

For peace of mind, you can also export to CSV anytime:
1. Open any table
2. Click **Download as CSV** in the top right
