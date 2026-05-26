-- ============================================================
-- Keith Prints — Remove print_time_hours and multicolor_print_time_hours
-- Run AFTER 008_shop_colors_active_grant.sql in Supabase SQL Editor.
--
-- Print time is operator-only metadata that's no longer surfaced
-- anywhere customer-facing (the detail-modal chip was removed) and
-- isn't used by any pricing, view, or webhook calculation. Removing
-- it cleans up the products schema and removes a required field from
-- the admin form.
--
-- The products_multicolor_complete check constraint currently
-- references multicolor_print_time_hours — we drop the constraint,
-- drop the columns, then re-add a constraint that only requires the
-- two remaining multicolor fields (sale_price + unit_cost) when the
-- toggle is on.
-- ============================================================

-- 1) Drop the constraint that references multicolor_print_time_hours.
alter table public.products
  drop constraint if exists products_multicolor_complete;

-- 2) Drop the two columns.
--    Postgres silently drops the column-level grants on these columns
--    along with the columns themselves, so no re-GRANT is needed for
--    the remaining columns.
alter table public.products
  drop column if exists print_time_hours,
  drop column if exists multicolor_print_time_hours;

-- 3) Re-add the multicolor constraint without print_time.
alter table public.products
  add constraint products_multicolor_complete check (
    multicolor_available = false
    or (
      multicolor_sale_price_cents is not null
      and multicolor_unit_cost_cents is not null
    )
  );
