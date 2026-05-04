-- ============================================================
-- Keith Prints — Multi-item orders (cart support)
-- Run AFTER 002_product_details.sql in Supabase SQL Editor.
--
-- Strategy: additive. Existing single-item rows on `orders` keep
-- their legacy columns; new cart-shaped rows leave those null and
-- write line items to the new `order_items` table. Views are
-- rewritten to read from `order_items`, so any pre-existing
-- single-item test orders won't appear in analytics — acceptable
-- since the prior orders were sandbox-only.
-- ============================================================

-- 1) Relax legacy single-item NOT NULL constraints so cart-shaped
--    orders can omit the per-product columns.
alter table public.orders
  alter column product_name drop not null,
  alter column sale_price_cents drop not null,
  alter column unit_cost_cents drop not null;

-- 2) Aggregate columns for cart-shaped orders.
alter table public.orders
  add column if not exists subtotal_cents int,
  add column if not exists shipping_cents int default 0,
  add column if not exists total_cents int,
  add column if not exists delivery_method text default 'shipping'
    check (delivery_method in ('shipping','local'));

-- 3) Child table — one row per cart line item.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  color text,
  customization_text text,
  quantity int not null default 1 check (quantity > 0),
  sale_price_cents int not null,
  unit_cost_cents int not null,
  created_at timestamptz default now()
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);

alter table public.order_items enable row level security;

drop policy if exists "auth full access order_items" on public.order_items;
create policy "auth full access order_items"
  on public.order_items for all
  to authenticated
  using (true) with check (true);

-- 4) Rewrite views to use order_items as source of truth.
--    DROP first because CREATE OR REPLACE VIEW can't rename or reorder
--    existing columns, and the new monthly_summary changes its column shape.

drop view if exists public.bestsellers;
drop view if exists public.monthly_summary;
drop view if exists public.unsold_products;

create view public.bestsellers as
select
  p.id,
  p.name,
  p.category,
  p.sale_price_cents,
  p.unit_cost_cents,
  coalesce(sum(oi.quantity), 0) as units_sold,
  coalesce(sum(oi.sale_price_cents * oi.quantity), 0) as revenue_cents,
  coalesce(sum((oi.sale_price_cents - oi.unit_cost_cents) * oi.quantity), 0) as profit_cents,
  case
    when coalesce(sum(oi.sale_price_cents * oi.quantity), 0) = 0 then 0
    else round(
      (sum((oi.sale_price_cents - oi.unit_cost_cents) * oi.quantity)::numeric
        / sum(oi.sale_price_cents * oi.quantity)::numeric) * 100,
      1
    )
  end as margin_pct
from public.products p
left join public.order_items oi on oi.product_id = p.id
left join public.orders o on o.id = oi.order_id and o.status != 'cancelled'
group by p.id, p.name, p.category, p.sale_price_cents, p.unit_cost_cents
order by units_sold desc, revenue_cents desc;

create view public.monthly_summary as
with order_costs as (
  select oi.order_id, sum(oi.unit_cost_cents * oi.quantity) as cost_cents
  from public.order_items oi
  group by oi.order_id
)
select
  date_trunc('month', o.created_at) as month,
  count(*) as orders,
  coalesce(sum(o.subtotal_cents), 0) as subtotal_cents,
  coalesce(sum(o.shipping_cents), 0) as shipping_cents,
  coalesce(sum(o.total_cents), 0) as revenue_cents,
  coalesce(sum(oc.cost_cents), 0) as cost_cents,
  coalesce(sum(o.total_cents) - coalesce(sum(oc.cost_cents), 0), 0) as profit_cents,
  case
    when coalesce(sum(o.total_cents), 0) = 0 then 0
    else round(
      ((sum(o.total_cents) - coalesce(sum(oc.cost_cents), 0))::numeric
        / sum(o.total_cents)::numeric) * 100,
      1
    )
  end as margin_pct
from public.orders o
left join order_costs oc on oc.order_id = o.id
where o.status != 'cancelled'
group by date_trunc('month', o.created_at)
order by month desc;

create view public.unsold_products as
select p.id, p.name, p.category, p.created_at, p.sale_price_cents
from public.products p
left join public.order_items oi on oi.product_id = p.id
left join public.orders o on o.id = oi.order_id and o.status != 'cancelled'
where p.active = true
group by p.id, p.name, p.category, p.created_at, p.sale_price_cents
having count(oi.id) = 0
order by p.created_at desc;

grant select on public.bestsellers to authenticated;
grant select on public.monthly_summary to authenticated;
grant select on public.unsold_products to authenticated;
