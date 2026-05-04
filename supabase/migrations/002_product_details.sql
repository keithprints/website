-- ============================================================
-- Keith Prints — Product detail enhancements
-- Run AFTER 001_init.sql in Supabase SQL Editor.
-- Adds a photo gallery and a long-form details field for the
-- click-through product detail modal.
-- ============================================================

alter table public.products
  add column if not exists gallery_urls text[] default '{}',
  add column if not exists details text;

-- Note: no RLS changes needed. The "anon read active products" policy
-- in 001_init.sql is row-level only; column-level visibility is enforced
-- in src/lib/supabase.js via an explicit SELECT column list.
