-- ============================================================
-- Keith Prints — Initial schema
-- Run this in Supabase SQL Editor: New query → paste → Run
-- ============================================================

-- ============ PRODUCTS ============
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  slug text unique not null,
  description text,
  category text check (category in ('keychains','fidgets','figurines','ornaments','more')),
  image_url text,
  colors text[] default '{}',
  customizable boolean default false,
  customization_label text,
  customization_max_chars int default 8,
  sale_price_cents int not null check (sale_price_cents >= 0),
  unit_cost_cents int not null default 0 check (unit_cost_cents >= 0),
  print_time_hours numeric(4,1),
  active boolean default true,
  featured boolean default false,
  badge text check (badge in ('new','hot','fav') or badge is null),
  display_order int default 0
);

create index if not exists products_category_idx on public.products(category);
create index if not exists products_active_idx on public.products(active);

-- ============ ORDERS ============
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  stripe_session_id text unique not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  color text,
  customization_text text,
  sale_price_cents int not null,
  unit_cost_cents int not null,
  customer_email text,
  customer_name text,
  shipping_address jsonb,
  status text default 'new' check (status in ('new','printing','shipped','cancelled')),
  notes text
);

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);

-- ============ ROW-LEVEL SECURITY ============
alter table public.products enable row level security;
alter table public.orders enable row level security;

-- Anonymous (public website) can SELECT active products only.
-- The application layer further restricts which COLUMNS are returned
-- (never selects unit_cost_cents). This is defense-in-depth.
drop policy if exists "anon read active products" on public.products;
create policy "anon read active products"
  on public.products for select
  to anon
  using (active = true);

-- Authenticated users (Keith, Mom) get full CRUD on products
drop policy if exists "auth full access products" on public.products;
create policy "auth full access products"
  on public.products for all
  to authenticated
  using (true)
  with check (true);

-- Orders: anon gets nothing. Authenticated and service_role get everything.
-- (Service role bypasses RLS automatically, used by webhook function.)
drop policy if exists "auth full access orders" on public.orders;
create policy "auth full access orders"
  on public.orders for all
  to authenticated
  using (true)
  with check (true);

-- ============ ANALYTICAL VIEWS ============
-- Bestsellers: products ranked by units sold and revenue
create or replace view public.bestsellers as
select
  p.id,
  p.name,
  p.category,
  p.sale_price_cents,
  p.unit_cost_cents,
  count(o.id) as units_sold,
  coalesce(sum(o.sale_price_cents), 0) as revenue_cents,
  coalesce(sum(o.sale_price_cents - o.unit_cost_cents), 0) as profit_cents,
  case
    when coalesce(sum(o.sale_price_cents), 0) = 0 then 0
    else round(
      (sum(o.sale_price_cents - o.unit_cost_cents)::numeric / sum(o.sale_price_cents)::numeric) * 100,
      1
    )
  end as margin_pct
from public.products p
left join public.orders o on o.product_id = p.id and o.status != 'cancelled'
group by p.id, p.name, p.category, p.sale_price_cents, p.unit_cost_cents
order by units_sold desc, revenue_cents desc;

-- Monthly summary: revenue/cost/profit by month
create or replace view public.monthly_summary as
select
  date_trunc('month', created_at) as month,
  count(*) as orders,
  sum(sale_price_cents) as revenue_cents,
  sum(unit_cost_cents) as cost_cents,
  sum(sale_price_cents - unit_cost_cents) as profit_cents,
  case
    when sum(sale_price_cents) = 0 then 0
    else round((sum(sale_price_cents - unit_cost_cents)::numeric / sum(sale_price_cents)::numeric) * 100, 1)
  end as margin_pct
from public.orders
where status != 'cancelled'
group by date_trunc('month', created_at)
order by month desc;

-- Unsold products: active products with zero non-cancelled orders
create or replace view public.unsold_products as
select p.id, p.name, p.category, p.created_at, p.sale_price_cents
from public.products p
left join public.orders o on o.product_id = p.id and o.status != 'cancelled'
where p.active = true
group by p.id, p.name, p.category, p.created_at, p.sale_price_cents
having count(o.id) = 0
order by p.created_at desc;

-- Grant view access to authenticated users
grant select on public.bestsellers to authenticated;
grant select on public.monthly_summary to authenticated;
grant select on public.unsold_products to authenticated;
