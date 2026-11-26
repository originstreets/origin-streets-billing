-- UPI IDs: the shop's UPI IDs, kept in Settings -> UPI. On the billing
-- counter the cashier picks one and the app draws a QR with that bill's
-- amount filled in. Each bill's UPI payment remembers which UPI ID it went to.

create table public.pos_upi_accounts (
  id uuid primary key default gen_random_uuid(),
  upi_id text not null check (upi_id ~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,64}$'),
  -- Optional label shown to the cashier, e.g. "SBI current".
  name text not null default '' check (char_length(name) <= 60),
  description text check (description is null or char_length(description) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.pos_upi_accounts enable row level security;
create policy "pos_upi_accounts: read" on public.pos_upi_accounts
  for select using (public.pos_is_staff());
create policy "pos_upi_accounts: insert requires SETTINGS" on public.pos_upi_accounts
  for insert with check (public.pos_has_permission('SETTINGS'));
create policy "pos_upi_accounts: update requires SETTINGS" on public.pos_upi_accounts
  for update using (public.pos_has_permission('SETTINGS')) with check (public.pos_has_permission('SETTINGS'));
create policy "pos_upi_accounts: delete requires SETTINGS" on public.pos_upi_accounts
  for delete using (public.pos_has_permission('SETTINGS'));

-- Which UPI ID a UPI payment went to.
alter table public.pos_payment_transactions add column upi_account text;

-- pos_checkout: as before, and keeps upi_account on UPI payments.
CREATE OR REPLACE FUNCTION public.pos_checkout(p_items jsonb, p_customer_id uuid, p_staff_id uuid, p_discount numeric, p_discount_reason text, p_shipping_fee numeric, p_payments jsonb, p_notes text, p_custom_tax_rate numeric DEFAULT NULL::numeric, p_customer_gstin text DEFAULT NULL::text)
 RETURNS pos_bills
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    insert into public.pos_payment_transactions (bill_id, method, amount, tendered, change_amount, upi_account)
    values (
      v_bill.id, v_pay->>'method', (v_pay->>'amount')::numeric,
      nullif(v_pay->>'tendered', '')::numeric, nullif(v_pay->>'change_amount', '')::numeric,
      case when v_pay->>'method' = 'UPI' then nullif(left(trim(coalesce(v_pay->>'upi_account', '')), 60), '') end
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
$function$;
