-- ============================================================
-- Keith Prints — Shop-level color inventory + multicolor variants
-- Run AFTER 006_storage_policies.sql in Supabase SQL Editor.
--
-- Replaces per-product products.colors[] with a business-level
-- shop_colors table. Adds multicolor-variant fields to products
-- (separate price/cost/print time when a product is configured for
-- multicolor printing). Adds a `variant` column to order_items so
-- historical orders record which variant was sold.
--
-- See docs/PUNCHLIST.md for the full scoping rationale.
-- ============================================================

-- ---------- 1) shop_colors table ----------

create table if not exists public.shop_colors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  display_order int default 0,
  active boolean default true,
  swatch_hex text  -- optional CSS color (e.g. '#1E90FF') for the picker chip
);

create index if not exists shop_colors_active_idx on public.shop_colors(active);
create index if not exists shop_colors_order_idx  on public.shop_colors(display_order, name);

-- ---------- 2) RLS for shop_colors ----------

alter table public.shop_colors enable row level security;

drop policy if exists "anon read active shop_colors"   on public.shop_colors;
drop policy if exists "auth full access shop_colors"   on public.shop_colors;

create policy "anon read active shop_colors"
  on public.shop_colors for select
  to anon
  using (active = true);

create policy "auth full access shop_colors"
  on public.shop_colors for all
  to authenticated
  using ((auth.jwt() ->> 'aal') = 'aal2')
  with check ((auth.jwt() ->> 'aal') = 'aal2');

-- Default-privilege lockdown from migration 005 means we have to grant
-- column SELECT explicitly to anon (no auto-grant).
revoke all on public.shop_colors from anon;
grant select (id, name, display_order, swatch_hex)
  on public.shop_colors to anon;

-- Authenticated reads/writes are gated by RLS above; the GRANT must
-- still be in place for them to reach RLS.
grant select, insert, update, delete on public.shop_colors to authenticated;

-- ---------- 3) Backfill shop_colors from existing products.colors ----------

-- One-time migration: seed shop_colors with the union of every distinct
-- color name currently used by any product. on conflict do nothing in
-- case the migration is re-run.
insert into public.shop_colors (name, display_order)
select distinct
  trim(unnested) as name,
  0 as display_order
from public.products,
     unnest(coalesce(colors, '{}')) as unnested
where trim(unnested) <> ''
on conflict do nothing;

-- ---------- 4) Multicolor columns on products ----------

alter table public.products
  add column if not exists multicolor_available        boolean default false,
  add column if not exists multicolor_sale_price_cents int,
  add column if not exists multicolor_unit_cost_cents  int,
  add column if not exists multicolor_print_time_hours numeric(4,1),
  add column if not exists multicolor_hint             text;

-- Constraint: when multicolor_available is true, all three numeric
-- fields must be non-null. Hint is optional (operator can leave it
-- blank if no extra guidance is needed).
alter table public.products
  drop constraint if exists products_multicolor_complete;

alter table public.products
  add constraint products_multicolor_complete check (
    multicolor_available = false
    or (
      multicolor_sale_price_cents is not null
      and multicolor_unit_cost_cents is not null
      and multicolor_print_time_hours is not null
    )
  );

-- ---------- 5) Re-grant anon's column SELECT on products ----------
-- (migration 005 set up column-level grants; we need to refresh
--  the grant to include the new public multicolor columns.)

revoke select on public.products from anon;
grant select (
  id,
  created_at,
  name,
  slug,
  description,
  details,
  category,
  image_url,
  gallery_urls,
  customizable,
  customization_label,
  customization_max_chars,
  sale_price_cents,
  print_time_hours,
  multicolor_available,
  multicolor_sale_price_cents,
  multicolor_print_time_hours,
  multicolor_hint,
  active,
  featured,
  badge,
  display_order
) on public.products to anon;
-- Note: unit_cost_cents and multicolor_unit_cost_cents are intentionally
-- omitted — they remain private.

-- ---------- 6) Drop products.colors ----------

alter table public.products
  drop column if exists colors;

-- ---------- 7) order_items.variant ----------

alter table public.order_items
  add column if not exists variant text not null default 'single'
    check (variant in ('single', 'multi'));

-- The existing `color` column carries either the chosen color name
-- (single) or the customer's free-text multicolor description (multi).
-- Application reads `variant` to know which interpretation to use.
