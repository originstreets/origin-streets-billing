-- db/migrations/0010_variant_colour_hex.sql
-- Colours are picked on a colour wheel: each colour x size row keeps the
-- colour itself (color_hex, e.g. #1F2A44) next to its name, so a swatch can
-- be shown beside the name on products, stock and billing.
begin;

-- Inserts colour x size rows for one product. p_variants is a JSON array of
-- { color, color_hex, size, price, stock }. Returns how many rows were added.
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
  v_hex text;
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
    -- The colour picked on the colour wheel, e.g. #1F2A44 (kept only when valid).
    v_hex := upper(nullif(btrim(coalesce(v_item->>'color_hex', '')), ''));
    if v_hex !~ '^#[0-9A-F]{6}$' then
      v_hex := null;
    end if;
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

    insert into public.product_variants (product_id, color, color_hex, size, price, stock)
    values (p_product.id, v_color, v_hex, v_size, v_price, v_stock)
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

commit;
