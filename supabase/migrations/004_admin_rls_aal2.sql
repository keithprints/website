-- ============================================================
-- Keith Prints — Tighten admin RLS to require MFA-verified sessions
-- Run AFTER 003_multi_item_orders.sql in Supabase SQL Editor.
--
-- After this migration, the `authenticated` role can only read/write
-- the products / orders / order_items tables when the JWT carries
-- AAL2 (Authentication Assurance Level 2 — i.e., the user has
-- completed an MFA challenge in the current session).
--
-- - The anon role's read access to active products is unchanged.
-- - The service_role used by /api/webhook bypasses RLS as before.
-- - The Supabase dashboard's Table Editor uses an internal admin role
--   that also bypasses RLS; you can keep editing there as a fallback.
-- ============================================================

drop policy if exists "auth full access products" on public.products;
create policy "auth full access products"
  on public.products for all
  to authenticated
  using ((auth.jwt() ->> 'aal') = 'aal2')
  with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "auth full access orders" on public.orders;
create policy "auth full access orders"
  on public.orders for all
  to authenticated
  using ((auth.jwt() ->> 'aal') = 'aal2')
  with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "auth full access order_items" on public.order_items;
create policy "auth full access order_items"
  on public.order_items for all
  to authenticated
  using ((auth.jwt() ->> 'aal') = 'aal2')
  with check ((auth.jwt() ->> 'aal') = 'aal2');
