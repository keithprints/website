# Keith Prints — Queued Work

Features and refactors that are scoped but not yet built. Items here have an outline of design and intent — they're more than "wouldn't it be cool to…" but less than ready-to-code. When picking one up, read CLAUDE.md first for current state.

---

## 1. Color inventory: per-shop instead of per-product, with single vs. multicolor variants

**Status:** queued — not started.
**Captured:** 2026-05-05.

### Why

Today, each row in `products` carries its own `colors text[]` — a list of color names valid for that specific product. This was true for a craft shop with pre-made stock, but **for a 3D-printing shop it lies about reality**: any color filament in the shop's filament inventory could be used to print any product. Per-product color restrictions were busy work for catalog entry and arbitrary from the customer's view.

Plus today there's no concept of a multicolor variant — a figurine printed in a single color is a different product (different print time, more material) than the same figurine with separate colors for body / clothing / eyes / accessories. A figurine that prints in 2h / $0.85 cost in single color might be 8h / $3.40 in multicolor.

### Target design

**1. New `shop_colors` table** — the business-level filament inventory.

```
shop_colors
  id              uuid PK
  name            text not null      -- "Galaxy Blue", "Glow", "Forest Green"
  display_order   int                -- ordering in the customer picker
  active          boolean default true -- hide when out of filament
  swatch_hex      text               -- optional visual chip color (e.g. "#1E90FF")
  -- consider later: swatch_image_url for filaments that don't render well as a flat hex
```

RLS:
- Anon SELECT all `active = true` (so the public site can render the picker).
- Authenticated AAL2 full CRUD.

**2. Drop `products.colors`.** Customer-facing color picker reads from `shop_colors` where `active=true`. One-time backfill: union of all distinct existing per-product colors becomes seed `shop_colors` rows; then drop the column.

**3. Multicolor variant per product.** New columns on `products`:

```
multicolor_available       boolean default false
multicolor_sale_price_cents int       -- required when multicolor_available is true
multicolor_unit_cost_cents  int       -- required when multicolor_available is true
multicolor_print_time_hours numeric(4,1)  -- required when multicolor_available is true
multicolor_hint            text       -- e.g. "Include color choice for body, head, eyes"
```

If `multicolor_available` is true, the admin product form **rejects save** when any of the three pricing/timing fields are null (decided 2026-05-05). No runtime fallback math — operator must enter values explicitly so margins stay intentional.

**4. Customer flow on the product detail modal:**

- Mode picker (rendered only if `multicolor_available`): radios "Single color" / "Multicolor".
- Single mode → one dropdown listing all `active` shop colors.
- Multicolor mode → **free-text textarea** (decided 2026-05-05). Customer describes preferences ("body: green, eyes: red, hat: gold"). The operator can guide the customer by setting a per-product hint shown above the textarea — e.g., for a figurine: "Include color choice for body, head, eyes." For a keychain with a logo: "Include color choice for base and logo." The hint lives on the product (new column, e.g., `multicolor_hint text`).

- Price + print time chip in the modal updates based on the mode (single → standard fields; multi → multicolor fields).

**5. Cart / checkout:**

- Cart line items need new fields: `variant: 'single' | 'multi'` and either `color: string` (single) or `multicolor_description: string` (multi). Existing `customizationText` could carry the multicolor description — or add a new field for clarity.
- Stripe `price_data.unit_amount` and metadata reflect the chosen variant's price.
- `order_items` table: add `variant text not null check (variant in ('single','multi'))`. The existing `color` column carries either the single color name or the multicolor description.

**6. Admin:**

- New page `/admin/colors` — CRUD over `shop_colors`. Same pattern as the products table: list view, inline active toggle, click-to-edit, "+ New color" button.
- Product form: replace the colors text field with a "Multicolor available?" toggle. When ON, expand three more fields (multicolor price, cost, print time).

### Migration impact

- Schema: new `shop_colors` table; new columns on `products`; **drop** `products.colors` after backfill.
- Cart localStorage shape changes — bump key to `kp_cart_v2` and clear stale carts on first read.
- Webhook metadata format changes — if there are unprocessed Stripe sessions during deploy, they'd write the legacy shape; the webhook should accept both for a few days.

### Open questions before starting

1. ~~Free-text vs. structured multicolor input~~ — **resolved 2026-05-05: free-text with per-product hint.**
2. ~~Default fallback math for multicolor pricing when fields are null~~ — **resolved 2026-05-05: reject save when fields are null. No fallback math.**
3. Whether to keep order history of legacy single-shape orders untouched (yes — historic data is correct as-is).
