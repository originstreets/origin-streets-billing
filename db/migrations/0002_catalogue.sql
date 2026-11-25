-- db/migrations/0002_catalogue.sql
-- Origin's products, managed inside the billing app (Products -> Categories
-- & sizes, Add product). Vault 26 reads the same shapes from its website;
-- Origin has no website yet (online store: coming soon), so they live here.
--
--   categories        Shirts, T-shirts, Jeans ...
--   category_sizes    the standard sizes of a category (Shirts: S M L XL)
--   products          name, photo, price, category
--   product_variants  one row per colour x size, with its own stock and price
--
-- Rules:
--   * Stock only moves through the pos_* functions, so every change is in
--     the stock history (pos_inventory_logs). Nobody writes stock directly.
--   * products.stock and products.sizes are worked out from the variants by
--     the database and never written by the app.
begin;

-- ---------------------------------------------------------------- categories

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- "Shirts" and "shirts " are the same category.
create unique index categories_name_key on public.categories (lower(btrim(name)));

create table public.category_sizes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  size text not null check (btrim(size) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index category_sizes_key on public.category_sizes (category_id, lower(btrim(size)));

-- ---------------------------------------------------------------- products

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (btrim(name) <> ''),
  -- A category with products in it cannot be deleted.
  category_id uuid references public.categories(id) on delete restrict,
  -- The product's price; every colour x size starts at it and can be changed.
  price numeric not null default 0 check (price >= 0),
  compare_at numeric check (compare_at is null or compare_at >= 0),
  images text[] not null default '{}',
  -- Worked out from the variants (in the category's size order).
  sizes text[] not null default '{}',
  stock integer not null default 0,
  description text,
  material text,
  care text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on public.products (category_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  color text,
  color_hex text,
  stock integer not null default 0 check (stock >= 0),
  price numeric not null check (price >= 0),
  compare_price numeric check (compare_price is null or compare_price >= 0),
  sku text unique,
  created_at timestamptz not null default now()
);
create index idx_product_variants_product on public.product_variants (product_id);
-- One row per colour x size of a product.
create unique index product_variants_combo_key
  on public.product_variants (product_id, lower(coalesce(color, '')), lower(coalesce(size, '')));

-- products.stock = all its pieces; products.sizes = its sizes in the
-- category's order (then A-Z for any size no longer in the category list).
create or replace function public.refresh_product_totals(p_product_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products p
  set stock = coalesce((select sum(v.stock) from public.product_variants v where v.product_id = p.id), 0),
      sizes = coalesce((
        select array_agg(s.size order by s.ord, s.size)
        from (
          select distinct on (lower(v.size)) v.size,
            coalesce((
              select cs.sort_order from public.category_sizes cs
              where cs.category_id = p.category_id and lower(btrim(cs.size)) = lower(btrim(v.size))
            ), 100000) as ord
          from public.product_variants v
          where v.product_id = p.id and v.size is not null and btrim(v.size) <> ''
          order by lower(v.size)
        ) s
      ), '{}'),
      updated_at = now()
  where p.id = p_product_id;
$$;

create or replace function public.trg_variants_refresh_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_product_totals(new.product_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.product_id <> new.product_id) then
    perform public.refresh_product_totals(old.product_id);
  end if;
  return null;
end;
$$;

create trigger trg_product_variants_totals
  after insert or update or delete on public.product_variants
  for each row execute function public.trg_variants_refresh_product();

-- A product moved to another category takes that category's size order.
create or replace function public.trg_products_category_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_product_totals(new.id);
  return null;
end;
$$;

create trigger trg_products_category_changed
  after update of category_id on public.products
  for each row when (old.category_id is distinct from new.category_id)
  execute function public.trg_products_category_changed();

-- ---------------------------------------------------------------- settings
-- key 'invoice' = the shop's details printed on every bill (Settings ->
-- Shop details). Same shape Vault 26 uses for its Invoice template.
create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- access
-- Every billing account reads the catalogue; changing it needs PRODUCTS
-- (SETTINGS for shop details).

alter table public.categories enable row level security;
alter table public.category_sizes enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.settings enable row level security;

create policy "categories: read" on public.categories for select using (public.pos_is_staff());
create policy "categories: write requires PRODUCTS" on public.categories
  for all using (public.pos_has_permission('PRODUCTS')) with check (public.pos_has_permission('PRODUCTS'));

create policy "category_sizes: read" on public.category_sizes for select using (public.pos_is_staff());
create policy "category_sizes: write requires PRODUCTS" on public.category_sizes
  for all using (public.pos_has_permission('PRODUCTS')) with check (public.pos_has_permission('PRODUCTS'));

create policy "products: read" on public.products for select using (public.pos_is_staff());
create policy "products: update requires PRODUCTS" on public.products
  for update using (public.pos_has_permission('PRODUCTS')) with check (public.pos_has_permission('PRODUCTS'));
create policy "products: delete requires PRODUCTS" on public.products
  for delete using (public.pos_has_permission('PRODUCTS'));

create policy "product_variants: read" on public.product_variants for select using (public.pos_is_staff());
create policy "product_variants: update requires PRODUCTS" on public.product_variants
  for update using (public.pos_has_permission('PRODUCTS')) with check (public.pos_has_permission('PRODUCTS'));
-- A colour x size can be removed only once it has no pieces left.
create policy "product_variants: delete empty rows requires PRODUCTS" on public.product_variants
  for delete using (public.pos_has_permission('PRODUCTS') and stock = 0);

create policy "settings: read" on public.settings for select using (public.pos_is_staff());
create policy "settings: write requires SETTINGS" on public.settings
  for all using (public.pos_has_permission('SETTINGS')) with check (public.pos_has_permission('SETTINGS'));

-- New products and colour x size rows come in through pos_create_product /
-- pos_add_variants (0004), which also write the opening stock to the stock
-- history. Stock, sizes and totals are never written from the app.
revoke insert, update on public.products from anon, authenticated;
grant update (slug, name, category_id, price, compare_at, images, description, material, care, is_active)
  on public.products to authenticated;
revoke insert, update on public.product_variants from anon, authenticated;
grant update (price, compare_price, sku, color_hex) on public.product_variants to authenticated;

commit;
