-- ============================================================
-- Keith Prints — Pre-launch security hardening
-- Run AFTER 004_admin_rls_aal2.sql in Supabase SQL Editor.
--
-- Closes two data-exposure holes from the pre-launch security review:
--
-- C1 (Critical): The analytical views bestsellers, monthly_summary,
--    unsold_products were readable with the public anon key. Views
--    in Postgres run with the owner's privileges (not the caller's),
--    so RLS on the underlying tables doesn't protect view output.
--    Anyone with the deployed anon key could pull unit_cost_cents,
--    revenue, profit, and margin data. We revoke anon access here.
--
-- M4 (Medium):  Anon had table-level SELECT on products with no
--    column restriction. The application's src/lib/supabase.js
--    uses an explicit column allow-list, but a malicious caller
--    could query the REST endpoint directly with
--    ?select=unit_cost_cents. We replace the table-level SELECT
--    with a column-level grant covering only public columns.
-- ============================================================

-- 1) Revoke anon (and the broader public group) from analytical views.
revoke all on public.bestsellers      from anon, public;
revoke all on public.monthly_summary  from anon, public;
revoke all on public.unsold_products  from anon, public;

-- Keep authenticated grants in place — they were already correct
-- (created in migrations 001 and 003). The AAL2 RLS policies on the
-- underlying tables block aal1 sessions from feeding the views.

-- 2) Column-level grants on products. Drop the broad SELECT, then
--    grant SELECT only on the columns the public site actually needs.
--    unit_cost_cents is omitted — it now stays private even if a
--    malicious client tries ?select=unit_cost_cents directly.
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
  colors,
  customizable,
  customization_label,
  customization_max_chars,
  sale_price_cents,
  print_time_hours,
  active,
  featured,
  badge,
  display_order
) on public.products to anon;

-- 3) Default privileges: any future tables/views in `public` will
--    not auto-grant SELECT to anon. Whoever creates a new public
--    object must explicitly grant access.
alter default privileges in schema public revoke select on tables from anon;
