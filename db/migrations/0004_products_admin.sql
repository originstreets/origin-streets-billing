-- db/migrations/0004_products_admin.sql
-- Adding products from the billing app (Origin has no website admin).
--
--   pos_create_product  a product with its colour x size rows and their
--                       opening stock, all at once (nothing half-saved)
--   pos_add_variants    more colours or sizes for an existing product
--
-- Opening stock is written to the stock history as "New stock", the same as
-- any later restock. Product photos go to the public 'product-images'
-- storage bucket.
begin;

-- "Black Oversized Tee" -> "black-oversized-tee", made unique with -2, -3 ...
create or replace function public.pos_unique_product_slug(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text := btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-');
  v_slug text;
  v_n integer := 1;
begin
  if v_base = '' then
    v_base := 'item';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.products where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- Inserts colour x size rows for one product. p_variants is a JSON array of
-- { color, size, price, stock }. Returns how many rows were added.
create or replace function public.pos_insert_variants(
  p_product public.products,
  p_variants jsonb,
  p_staff_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_variant public.product_variants;
  v_color text;
  v_size text;
  v_price numeric;
  v_stock integer;
  v_count integer := 0;
begin
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'Add at least one colour and size';
  end if;

  for v_item in select * from jsonb_array_elements(p_variants) loop
    v_color := nullif(btrim(coalesce(v_item->>'color', '')), '');
    v_size := nullif(btrim(coalesce(v_item->>'size', '')), '');
    v_price := coalesce(nullif(v_item->>'price', '')::numeric, p_product.price);
    v_stock := coalesce(nullif(v_item->>'stock', '')::integer, 0);
    if v_size is null then
      raise exception 'Every row needs a size';
    end if;
    if v_price < 0 then
      raise exception 'Price cannot be below 0';
    end if;
    if v_stock < 0 then
      raise exception 'Stock cannot be below 0';
    end if;
    if exists (
      select 1 from public.product_variants
      where product_id = p_product.id
        and lower(coalesce(color, '')) = lower(coalesce(v_color, ''))
        and lower(coalesce(size, '')) = lower(v_size)
    ) then
      raise exception '% / % is already on this product', coalesce(v_color, '-'), v_size;
    end if;

    insert into public.product_variants (product_id, color, size, price, stock)
    values (p_product.id, v_color, v_size, v_price, v_stock)
    returning * into v_variant;

    if v_stock > 0 then
      insert into public.pos_inventory_logs (variant_id, product_id, product_slug, change_qty, new_stock, reason, staff_id, note)
      values (v_variant.id, p_product.id, p_product.slug, v_stock, v_stock, 'RESTOCK', p_staff_id, 'Opening stock');
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.pos_insert_variants(public.products, jsonb, uuid) from public, anon, authenticated;

-- A new product with its colour x size rows and opening stock.
-- p_product: { name, category_id, price, compare_at, image_url, description }
create or replace function public.pos_create_product(p_product jsonb, p_variants jsonb, p_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_product->>'name', ''));
  v_category uuid := nullif(p_product->>'category_id', '')::uuid;
  v_price numeric := coalesce(nullif(p_product->>'price', '')::numeric, 0);
  v_image text := nullif(btrim(coalesce(p_product->>'image_url', '')), '');
  v_product public.products;
begin
  if not public.pos_has_permission('PRODUCTS') then
    raise exception 'Not allowed: this account cannot add products';
  end if;
  if v_name = '' then
    raise exception 'The product needs a name';
  end if;
  if v_category is null or not exists (select 1 from public.categories where id = v_category) then
    raise exception 'Choose a category';
  end if;
  if v_price < 0 then
    raise exception 'Price cannot be below 0';
  end if;

  insert into public.products (slug, name, category_id, price, compare_at, images, description)
  values (
    public.pos_unique_product_slug(v_name),
    v_name,
    v_category,
    v_price,
    nullif(p_product->>'compare_at', '')::numeric,
    case when v_image is null then '{}'::text[] else array[v_image] end,
    nullif(btrim(coalesce(p_product->>'description', '')), '')
  )
  returning * into v_product;

  perform public.pos_insert_variants(v_product, p_variants, p_staff_id);
  return v_product.id;
end;
$$;

-- More colours or sizes for a product that already exists.
create or replace function public.pos_add_variants(p_product_id uuid, p_variants jsonb, p_staff_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
begin
  if not public.pos_has_permission('PRODUCTS') then
    raise exception 'Not allowed: this account cannot change products';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if v_product.id is null then
    raise exception 'Product not found';
  end if;
  return public.pos_insert_variants(v_product, p_variants, p_staff_id);
end;
$$;

revoke all on function public.pos_create_product(jsonb, jsonb, uuid) from public, anon;
revoke all on function public.pos_add_variants(uuid, jsonb, uuid) from public, anon;
grant execute on function public.pos_create_product(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.pos_add_variants(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------- product photos
-- Public bucket: photos show on screens and price tags without signing in.
-- Uploading, replacing and deleting need the PRODUCTS permission.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "product-images: upload requires PRODUCTS" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.pos_has_permission('PRODUCTS'));
create policy "product-images: replace requires PRODUCTS" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.pos_has_permission('PRODUCTS'))
  with check (bucket_id = 'product-images' and public.pos_has_permission('PRODUCTS'));
create policy "product-images: delete requires PRODUCTS" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.pos_has_permission('PRODUCTS'));

commit;
