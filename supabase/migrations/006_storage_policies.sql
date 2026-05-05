-- ============================================================
-- Keith Prints — Storage policies for the product-images bucket
-- Run AFTER creating the `product-images` bucket via the Supabase
-- dashboard (Storage → New bucket).
--
-- Policies:
--   1. Public SELECT — anyone can fetch a product image URL (the
--      public site needs this with no auth)
--   2. Authenticated AAL2 INSERT — only MFA-verified admin can upload
--   3. Authenticated AAL2 UPDATE — only MFA-verified admin can replace
--   4. Authenticated AAL2 DELETE — only MFA-verified admin can remove
--
-- The bucket itself must be marked Public in the dashboard (so public
-- URLs work), with file size cap and MIME-type restrictions configured
-- there too. RLS on storage.objects is the gate for who can write.
-- ============================================================

-- Drop any pre-existing policies with these names, in case the
-- migration is being re-run.
drop policy if exists "anon read product-images"          on storage.objects;
drop policy if exists "auth aal2 insert product-images"   on storage.objects;
drop policy if exists "auth aal2 update product-images"   on storage.objects;
drop policy if exists "auth aal2 delete product-images"   on storage.objects;

-- 1) Public SELECT — anon and authenticated can read.
create policy "anon read product-images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

-- 2) Authenticated AAL2 INSERT — only MFA-verified sessions can upload.
create policy "auth aal2 insert product-images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

-- 3) Authenticated AAL2 UPDATE — only MFA-verified sessions can replace.
create policy "auth aal2 update product-images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    bucket_id = 'product-images'
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

-- 4) Authenticated AAL2 DELETE — only MFA-verified sessions can remove.
create policy "auth aal2 delete product-images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (auth.jwt() ->> 'aal') = 'aal2'
  );
