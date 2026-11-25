-- db/migrations/0008_product_photos_read.sql
-- Billing accounts can list the product photos in storage. Supabase Storage
-- needs this to find a photo before removing or replacing it; showing photos
-- does not (the bucket is public).
create policy "product-images: staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and public.pos_is_staff());
