-- db/migrations/0003_pos_schema.sql
-- Shop billing for Origin: customers, bills, payments, stock history,
-- returns and bill numbers. Same as Vault 26 billing, with Origin's own
-- bill series (ORS) and no website orders (online store: coming soon).
--
--   * Stock only moves on product_variants, inside these functions, and
--     every change is written to pos_inventory_logs.
--   * Stock-moving functions are SECURITY DEFINER with an explicit
--     permission check, because nobody may write product_variants.stock
--     directly.
begin;

-- ---------------------------------------------------------------- customers + settings

-- Walk-in / in-store customers.
create table public.pos_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  address text,
  city text,
  gstin text,
  orders_count integer not null default 0,
  total_spend numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint pos_customers_gstin_format
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);

-- Billing-only settings. The shop's details (name, GSTIN, address, phone)
-- are in settings key 'invoice' (Settings -> Shop details).
create table public.pos_settings (
  id uuid primary key default gen_random_uuid(),
  tax_rate numeric not null default 0,
  -- GST slab: taxable value at or below the threshold -> low rate, above -> high rate.
  tax_threshold numeric not null default 2599 check (tax_threshold >= 0),
  tax_rate_low numeric not null default 5 check (tax_rate_low between 0 and 100),
  tax_rate_high numeric not null default 18 check (tax_rate_high between 0 and 100),
  shipping_flat_rate numeric not null default 0,
  free_shipping_threshold numeric not null default 0,
  currency text not null default 'INR',
  invoice_prefix text not null default 'ORS',
  printer_name text,
  printer_connection text check (printer_connection in ('WIFI', 'USB', 'ETHERNET')),
  last_test_print timestamptz,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);

insert into public.pos_settings (invoice_prefix) values ('ORS');

-- ---------------------------------------------------------------- bill numbers
-- ORS-<YYMM>-<NNNN>, restarting every month (IST), no gaps:
--   ORS-2611-0001, ORS-2611-0002, ...
-- Counters live in a table (not a sequence) so a rolled-back checkout gives
-- its number back. Only the trigger assigns numbers; clients cannot burn them.

create table public.pos_invoice_counters (
  series text not null,
  period text not null, -- YYMM in IST
  last_no integer not null,
  primary key (series, period)
);
alter table public.pos_invoice_counters enable row level security;
-- No policies: only the security-definer functions below touch it.

create or replace function public.pos_next_invoice_no(p_series text, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(p_at at time zone 'Asia/Kolkata', 'YYMM');
  v_no integer;
begin
  insert into public.pos_invoice_counters as c (series, period, last_no)
  values (p_series, v_period, 1)
  on conflict (series, period) do update set last_no = c.last_no + 1
  returning last_no into v_no;
  -- lpad would truncate past 9999; let the number widen instead.
  return p_series || '-' || v_period || '-' || case when v_no > 9999 then v_no::text else lpad(v_no::text, 4, '0') end;
end;
$$;
revoke all on function public.pos_next_invoice_no(text, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- bills

create table public.pos_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  pos_customer_id uuid references public.pos_customers(id) on delete set null,
  staff_id uuid references public.pos_staff(id) on delete set null,
  channel text not null default 'OFFLINE' check (channel = 'OFFLINE'),
  subtotal numeric not null default 0 check (subtotal >= 0),
  discount numeric not null default 0 check (discount >= 0),
  discount_reason text,
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  tax_rate numeric not null default 0 check (tax_rate between 0 and 100),
  tax_is_custom boolean not null default false,
  shipping_fee numeric not null default 0 check (shipping_fee >= 0),
  grand_total numeric not null default 0 check (grand_total >= 0),
  payment_status text not null default 'PAID' check (payment_status in ('PAID', 'PENDING', 'REFUNDED', 'FAILED')),
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'VOID', 'RETURNED')),
  notes text,
  customer_gstin text,
  created_at timestamptz not null default now(),
  constraint pos_bills_customer_gstin_format
    check (customer_gstin is null or customer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);

create or replace function public.pos_assign_bill_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.bill_number := public.pos_next_invoice_no('ORS', coalesce(new.created_at, now()));
  return new;
end;
$$;

create trigger trg_pos_bills_assign_number
  before insert on public.pos_bills
  for each row execute function public.pos_assign_bill_number();

-- One line of a bill. product_slug / product_name / size / color are a
-- snapshot taken at sale time, so an issued bill never changes even if the
-- product is renamed or deleted later. The links to the live product and
-- variant are kept while those exist.
create table public.pos_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.pos_bills(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_slug text not null,
  product_name text not null,
  size text,
  color text,
  qty integer not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0),
  item_discount numeric not null default 0 check (item_discount >= 0),
  line_total numeric not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.pos_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.pos_bills(id) on delete cascade,
  method text not null check (method in ('CASH', 'UPI', 'CARD', 'OTHER')),
  amount numeric not null check (amount > 0),
  tendered numeric,
  change_amount numeric,
  status text not null default 'SUCCESS' check (status in ('SUCCESS', 'REFUNDED', 'PENDING')),
  created_at timestamptz not null default now()
);

create table public.pos_inventory_logs (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references public.product_variants(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_slug text not null,
  change_qty integer not null,
  new_stock integer not null check (new_stock >= 0),
  reason text not null check (reason in ('SALE', 'RESTOCK', 'ADJUSTMENT', 'RETURN_RESTOCK', 'DAMAGED', 'VOID', 'EDIT')),
  bill_id uuid references public.pos_bills(id) on delete set null,
  staff_id uuid references public.pos_staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create sequence public.pos_return_number_seq start 1;

create table public.pos_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique default ('ORS-RET-' || nextval('public.pos_return_number_seq')::text),
  bill_id uuid not null references public.pos_bills(id) on delete cascade,
  bill_item_id uuid not null references public.pos_bill_items(id) on delete cascade,
  qty integer not null check (qty > 0),
  reason text not null,
  condition text,
  refund_amount numeric not null check (refund_amount >= 0),
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED')),
  staff_id uuid references public.pos_staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_pos_bills_created_at on public.pos_bills (created_at desc);
create index idx_pos_bills_customer on public.pos_bills (pos_customer_id);
create index idx_pos_bill_items_bill on public.pos_bill_items (bill_id);
create index idx_pos_bill_items_variant on public.pos_bill_items (variant_id);
create index idx_pos_bill_items_product on public.pos_bill_items (product_id);
create index idx_pos_payment_transactions_bill on public.pos_payment_transactions (bill_id);
create index idx_pos_inventory_logs_variant on public.pos_inventory_logs (variant_id);
create index idx_pos_inventory_logs_product on public.pos_inventory_logs (product_id);
create index idx_pos_returns_bill on public.pos_returns (bill_id);

-- ---------------------------------------------------------------- row level security

alter table public.pos_customers enable row level security;
alter table public.pos_settings enable row level security;
alter table public.pos_bills enable row level security;
alter table public.pos_bill_items enable row level security;
alter table public.pos_payment_transactions enable row level security;
alter table public.pos_inventory_logs enable row level security;
alter table public.pos_returns enable row level security;

-- Reads are open to every billing account (billing needs to show products,
-- customers etc. even without that screen's permission). Writes need the
-- matching permission.
create policy "pos_customers: read" on public.pos_customers
  for select using (public.pos_is_staff());
create policy "pos_customers: write requires CUSTOMERS or BILLING" on public.pos_customers
  for all using (public.pos_has_permission('CUSTOMERS') or public.pos_has_permission('BILLING'))
  with check (public.pos_has_permission('CUSTOMERS') or public.pos_has_permission('BILLING'));

create policy "pos_settings: read" on public.pos_settings
  for select using (public.pos_is_staff());
create policy "pos_settings: write requires SETTINGS" on public.pos_settings
  for all using (public.pos_has_permission('SETTINGS')) with check (public.pos_has_permission('SETTINGS'));

create policy "pos_bills: read" on public.pos_bills
  for select using (public.pos_is_staff());
create policy "pos_bills: insert requires BILLING" on public.pos_bills
  for insert with check (public.pos_has_permission('BILLING'));
create policy "pos_bills: update requires BILLS" on public.pos_bills
  for update using (public.pos_has_permission('BILLS')) with check (public.pos_has_permission('BILLS'));

create policy "pos_bill_items: read" on public.pos_bill_items
  for select using (public.pos_is_staff());
create policy "pos_bill_items: insert requires BILLING" on public.pos_bill_items
  for insert with check (public.pos_has_permission('BILLING'));
create policy "pos_bill_items: update requires BILLS" on public.pos_bill_items
  for update using (public.pos_has_permission('BILLS')) with check (public.pos_has_permission('BILLS'));
create policy "pos_bill_items: delete requires BILLS" on public.pos_bill_items
  for delete using (public.pos_has_permission('BILLS'));

create policy "pos_payment_transactions: read" on public.pos_payment_transactions
  for select using (public.pos_is_staff());
create policy "pos_payment_transactions: write requires BILLING" on public.pos_payment_transactions
  for all using (public.pos_has_permission('BILLING')) with check (public.pos_has_permission('BILLING'));

create policy "pos_inventory_logs: read" on public.pos_inventory_logs
  for select using (public.pos_is_staff());
create policy "pos_inventory_logs: insert requires BILLING or PRODUCTS" on public.pos_inventory_logs
  for insert with check (public.pos_has_permission('BILLING') or public.pos_has_permission('PRODUCTS'));

create policy "pos_returns: read" on public.pos_returns
  for select using (public.pos_is_staff());
create policy "pos_returns: write requires BILLS" on public.pos_returns
  for all using (public.pos_has_permission('BILLS')) with check (public.pos_has_permission('BILLS'));

-- ---------------------------------------------------------------- GST slab

create or replace function public.pos_slab_tax_rate(p_taxable numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_taxable <= coalesce(s.tax_threshold, 2599) then coalesce(s.tax_rate_low, 5)
    else coalesce(s.tax_rate_high, 18)
  end
  from (select 1) one
  left join lateral (select * from public.pos_settings limit 1) s on true;
$$;

-- Slab rate unless a custom % was given; a custom % is OWNER-only.
create or replace function public.pos_resolve_tax_rate(p_taxable numeric, p_custom_tax_rate numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_custom_tax_rate is null then
    return public.pos_slab_tax_rate(p_taxable);
  end if;
  if not public.pos_is_owner() then
    raise exception 'Only the OWNER can set a custom tax rate';
  end if;
  if p_custom_tax_rate < 0 or p_custom_tax_rate > 100 then
    raise exception 'Custom tax rate must be between 0 and 100';
  end if;
  return p_custom_tax_rate;
end;
$$;

-- ---------------------------------------------------------------- checkout
-- One whole shop sale, atomically: locks each variant row, checks and
-- reduces its stock, writes the bill, its lines, payments and stock log.
-- Every line must be a real colour x size row (product_variants). Product,
-- size and colour are taken from the database, not from the client.
create or replace function public.pos_checkout(
  p_items jsonb,
  p_customer_id uuid,
  p_staff_id uuid,
  p_discount numeric,
  p_discount_reason text,
  p_shipping_fee numeric,
  p_payments jsonb,
  p_notes text,
  p_custom_tax_rate numeric default null,
  p_customer_gstin text default null
)
returns public.pos_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.pos_bills;
  v_item jsonb;
  v_pay jsonb;
  v_subtotal numeric := 0;
  v_taxable numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_grand_total numeric;
  v_variant public.product_variants;
  v_product public.products;
  v_qty integer;
  v_new_stock integer;
  v_line_total numeric;
  v_variant_id uuid;
  v_gstin text := nullif(upper(regexp_replace(coalesce(p_customer_gstin, ''), '\s', '', 'g')), '');
begin
  if not public.pos_has_permission('BILLING') then
    raise exception 'Not allowed: this account cannot make bills';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The bill has no items';
  end if;

  -- p_discount is the bill-level discount only; item discounts are already
  -- netted out of each line (and so out of v_subtotal).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal
      + ((v_item->>'unit_price')::numeric * (v_item->>'qty')::integer)
      - coalesce((v_item->>'item_discount')::numeric, 0);
  end loop;

  v_taxable := greatest(0, v_subtotal - coalesce(p_discount, 0));
  v_tax_rate := public.pos_resolve_tax_rate(v_taxable, p_custom_tax_rate);
  v_tax_amount := round(v_taxable * v_tax_rate / 100);
  v_grand_total := v_taxable + v_tax_amount + coalesce(p_shipping_fee, 0);

  insert into public.pos_bills (
    pos_customer_id, staff_id, subtotal, discount, discount_reason, tax_amount, tax_rate, tax_is_custom,
    shipping_fee, grand_total, notes, customer_gstin
  ) values (
    p_customer_id, p_staff_id, v_subtotal, coalesce(p_discount, 0), p_discount_reason, v_tax_amount, v_tax_rate,
    p_custom_tax_rate is not null, coalesce(p_shipping_fee, 0), v_grand_total, p_notes, v_gstin
  ) returning * into v_bill;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'qty')::integer;
    if v_variant_id is null then
      raise exception 'Every item needs a colour and size';
    end if;

    select * into v_variant from public.product_variants where id = v_variant_id for update;
    if v_variant.id is null then
      raise exception 'This item no longer exists';
    end if;
    select * into v_product from public.products where id = v_variant.product_id;
    if v_variant.stock < v_qty then
      raise exception 'Not enough stock for % (% / %): have %, need %',
        v_product.name, coalesce(v_variant.color, '-'), coalesce(v_variant.size, '-'), v_variant.stock, v_qty;
    end if;

    v_new_stock := v_variant.stock - v_qty;
    update public.product_variants set stock = v_new_stock where id = v_variant.id;

    v_line_total := ((v_item->>'unit_price')::numeric * v_qty) - coalesce((v_item->>'item_discount')::numeric, 0);

    insert into public.pos_bill_items (
      bill_id, variant_id, product_id, product_slug, product_name, size, color, qty, unit_price, item_discount, line_total
    ) values (
      v_bill.id, v_variant.id, v_product.id, v_product.slug, v_product.name,
      v_variant.size, v_variant.color, v_qty,
      (v_item->>'unit_price')::numeric, coalesce((v_item->>'item_discount')::numeric, 0), v_line_total
    );

    insert into public.pos_inventory_logs (
      variant_id, product_id, product_slug, change_qty, new_stock, reason, bill_id, staff_id
    ) values (
      v_variant.id, v_product.id, v_product.slug, -v_qty, v_new_stock, 'SALE', v_bill.id, p_staff_id
    );
  end loop;

  for v_pay in select * from jsonb_array_elements(p_payments) loop
    insert into public.pos_payment_transactions (bill_id, method, amount, tendered, change_amount)
    values (
      v_bill.id, v_pay->>'method', (v_pay->>'amount')::numeric,
      nullif(v_pay->>'tendered', '')::numeric, nullif(v_pay->>'change_amount', '')::numeric
    );
  end loop;

  if p_customer_id is not null then
    update public.pos_customers
    set orders_count = orders_count + 1,
        total_spend = total_spend + v_grand_total,
        gstin = coalesce(v_gstin, gstin)
    where id = p_customer_id;
  end if;

  return v_bill;
end;
$$;

-- ---------------------------------------------------------------- stock adjust
-- Manual stock change from the Products screen (restock, damaged,
-- correction, return put back on the shelf).
create or replace function public.pos_adjust_stock(
  p_variant_id uuid,
  p_change_qty integer,
  p_reason text,
  p_staff_id uuid,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant public.product_variants;
  v_product public.products;
  v_new_stock integer;
begin
  if not public.pos_has_permission('PRODUCTS') then
    raise exception 'Not allowed: this account cannot change stock';
  end if;
  if p_reason not in ('RESTOCK', 'ADJUSTMENT', 'RETURN_RESTOCK', 'DAMAGED') then
    raise exception 'Unknown stock reason %', p_reason;
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if v_variant.id is null then
    raise exception 'This item no longer exists';
  end if;
  select * into v_product from public.products where id = v_variant.product_id;

  v_new_stock := greatest(0, v_variant.stock + p_change_qty);
  update public.product_variants set stock = v_new_stock where id = p_variant_id;

  insert into public.pos_inventory_logs (variant_id, product_id, product_slug, change_qty, new_stock, reason, staff_id, note)
  values (v_variant.id, v_product.id, v_product.slug, v_new_stock - v_variant.stock, v_new_stock, p_reason, p_staff_id, p_note);

  return v_new_stock;
end;
$$;

-- ---------------------------------------------------------------- void bill
-- Cancels a settled bill: every item goes back into stock, bill marked VOID.
create or replace function public.pos_void_bill(p_bill_id uuid, p_staff_id uuid, p_reason text)
returns public.pos_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.pos_bills;
  v_item public.pos_bill_items;
  v_new_stock integer;
begin
  if not public.pos_has_permission('BILLS') then
    raise exception 'Not allowed: this account cannot cancel bills';
  end if;

  select * into v_bill from public.pos_bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'Bill not found';
  end if;
  if v_bill.status = 'VOID' then
    raise exception 'Bill % is already cancelled', v_bill.bill_number;
  end if;

  for v_item in select * from public.pos_bill_items where bill_id = p_bill_id loop
    -- A colour x size deleted since the sale has nothing to restock.
    v_new_stock := null;
    if v_item.variant_id is not null then
      update public.product_variants set stock = stock + v_item.qty where id = v_item.variant_id
        returning stock into v_new_stock;
      if v_new_stock is not null then
        insert into public.pos_inventory_logs (variant_id, product_id, product_slug, change_qty, new_stock, reason, bill_id, staff_id, note)
        values (v_item.variant_id, v_item.product_id, v_item.product_slug, v_item.qty, v_new_stock, 'VOID', p_bill_id, p_staff_id, p_reason);
      end if;
    end if;
  end loop;

  update public.pos_bills set status = 'VOID', notes = coalesce(notes || ' | ', '') || 'VOIDED: ' || coalesce(p_reason, '')
  where id = p_bill_id
  returning * into v_bill;

  if v_bill.pos_customer_id is not null then
    update public.pos_customers
    set orders_count = greatest(0, orders_count - 1),
        total_spend = greatest(0, total_spend - v_bill.grand_total)
    where id = v_bill.pos_customer_id;
  end if;

  return v_bill;
end;
$$;

-- ---------------------------------------------------------------- edit bill
-- Full edit of a settled bill's lines and totals. OWNER only. Old lines go
-- back into stock first, then the edited lines are taken out again (with a
-- stock check, so an edit can never push stock below what is really there).
create or replace function public.pos_edit_bill(
  p_bill_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_discount_reason text,
  p_shipping_fee numeric,
  p_notes text,
  p_editor_staff_id uuid,
  p_custom_tax_rate numeric default null
)
returns public.pos_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.pos_bills;
  v_old_item public.pos_bill_items;
  v_item jsonb;
  v_variant public.product_variants;
  v_product public.products;
  v_variant_id uuid;
  v_qty integer;
  v_new_stock integer;
  v_subtotal numeric := 0;
  v_taxable numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_grand_total numeric;
  v_old_total numeric;
begin
  if not public.pos_is_owner() then
    raise exception 'Only the OWNER can edit a settled bill';
  end if;

  select * into v_bill from public.pos_bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'Bill not found';
  end if;
  if v_bill.status = 'VOID' then
    raise exception 'Bill % is cancelled and cannot be edited', v_bill.bill_number;
  end if;
  v_old_total := v_bill.grand_total;

  for v_old_item in select * from public.pos_bill_items where bill_id = p_bill_id loop
    if v_old_item.variant_id is not null then
      update public.product_variants set stock = stock + v_old_item.qty where id = v_old_item.variant_id;
    end if;
  end loop;
  delete from public.pos_bill_items where bill_id = p_bill_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal
      + ((v_item->>'unit_price')::numeric * (v_item->>'qty')::integer)
      - coalesce((v_item->>'item_discount')::numeric, 0);
  end loop;

  v_taxable := greatest(0, v_subtotal - coalesce(p_discount, 0));
  v_tax_rate := public.pos_resolve_tax_rate(v_taxable, p_custom_tax_rate);
  v_tax_amount := round(v_taxable * v_tax_rate / 100);
  v_grand_total := v_taxable + v_tax_amount + coalesce(p_shipping_fee, 0);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'qty')::integer;
    v_variant := null;
    v_product := null;

    if v_variant_id is not null then
      select * into v_variant from public.product_variants where id = v_variant_id for update;
    end if;

    if v_variant.id is not null then
      select * into v_product from public.products where id = v_variant.product_id;
      if v_variant.stock < v_qty then
        raise exception 'Not enough stock for % (% / %): have %, need %',
          v_product.name, coalesce(v_variant.color, '-'), coalesce(v_variant.size, '-'), v_variant.stock, v_qty;
      end if;
      v_new_stock := v_variant.stock - v_qty;
      update public.product_variants set stock = v_new_stock where id = v_variant.id;

      insert into public.pos_inventory_logs (variant_id, product_id, product_slug, change_qty, new_stock, reason, bill_id, staff_id, note)
      values (v_variant.id, v_product.id, v_product.slug, -v_qty, v_new_stock, 'EDIT', p_bill_id, p_editor_staff_id, 'Bill edited');
    end if;

    -- A line whose colour x size was deleted keeps its snapshot and moves no stock.
    insert into public.pos_bill_items (
      bill_id, variant_id, product_id, product_slug, product_name, size, color, qty, unit_price, item_discount, line_total
    ) values (
      p_bill_id,
      v_variant.id,
      coalesce(v_product.id, nullif(v_item->>'product_id', '')::uuid),
      coalesce(v_product.slug, v_item->>'product_slug', ''),
      coalesce(v_product.name, v_item->>'product_name', 'Item'),
      coalesce(v_variant.size, v_item->>'size'),
      coalesce(v_variant.color, v_item->>'color'),
      v_qty,
      (v_item->>'unit_price')::numeric, coalesce((v_item->>'item_discount')::numeric, 0),
      ((v_item->>'unit_price')::numeric * v_qty) - coalesce((v_item->>'item_discount')::numeric, 0)
    );
  end loop;

  update public.pos_bills
  set subtotal = v_subtotal,
      discount = coalesce(p_discount, 0),
      discount_reason = p_discount_reason,
      tax_amount = v_tax_amount,
      tax_rate = v_tax_rate,
      tax_is_custom = p_custom_tax_rate is not null,
      shipping_fee = coalesce(p_shipping_fee, 0),
      grand_total = v_grand_total,
      notes = p_notes
  where id = p_bill_id
  returning * into v_bill;

  if v_bill.pos_customer_id is not null then
    update public.pos_customers
    set total_spend = greatest(0, total_spend - v_old_total + v_grand_total)
    where id = v_bill.pos_customer_id;
  end if;

  return v_bill;
end;
$$;

revoke all on function public.pos_checkout(jsonb, uuid, uuid, numeric, text, numeric, jsonb, text, numeric, text) from public, anon;
revoke all on function public.pos_adjust_stock(uuid, integer, text, uuid, text) from public, anon;
revoke all on function public.pos_void_bill(uuid, uuid, text) from public, anon;
revoke all on function public.pos_edit_bill(uuid, jsonb, numeric, text, numeric, text, uuid, numeric) from public, anon;
grant execute on function public.pos_checkout(jsonb, uuid, uuid, numeric, text, numeric, jsonb, text, numeric, text) to authenticated;
grant execute on function public.pos_adjust_stock(uuid, integer, text, uuid, text) to authenticated;
grant execute on function public.pos_void_bill(uuid, uuid, text) to authenticated;
grant execute on function public.pos_edit_bill(uuid, jsonb, numeric, text, numeric, text, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------- Origin's shop details
-- Printed on every bill; changed in Settings -> Shop details. Only empty
-- fields are filled, so re-running this never overwrites saved details.
-- GSTIN is not set here - enter it in Settings before giving GST bills.
insert into public.settings (key, value)
values (
  'invoice',
  jsonb_build_object(
    'company_name', 'Origin',
    'tagline', 'Street Culture',
    'address_line1', '55-3-45, HB Colony Rd, Last Bus Stop',
    'address_line2', 'Venkojipalem',
    'city', 'Visakhapatnam',
    'state', 'Andhra Pradesh',
    'pincode', '530022',
    'country', 'India',
    'phone', '+91 63023 51374'
  )
)
on conflict (key) do update
  set value = excluded.value || (
        select coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
        from jsonb_each(public.settings.value) as e(k, v)
        where e.v not in ('""'::jsonb, 'null'::jsonb)
      ),
      updated_at = now();

-- ---------------------------------------------------------------- live stock on every screen
-- Stock and product changes from another till reach open billing screens immediately.
do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_variants', 'categories', 'category_sizes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
