-- db/demo/seed_demo.sql
-- Sample data for showing Origin billing to the client. NOT for the live shop.
-- Remove it all with db/demo/remove_demo.sql (only sample rows are touched).
--
-- What it adds:
--   * 3 categories with their own sizes: T-Shirts (S-XXL), Shirts (38-44), Jeans (28-36)
--   * 9 products in 1-3 colours each, with stock per colour x size and a photo
--     (photos: product-images/demo/, drawn by db/demo/make_photos.py)
--   * 8 customers (one business customer with a GSTIN)
--   * 2 staff logins: ravi / ravi1234 (cashier) and sana / sana1234 (manager)
--   * bills on every day of November 2026 up to today, made by the owner and
--     both staff, with cash / UPI / card / split payments, some discounts, one
--     GST bill, one cancelled bill
--   * a restock, a damaged piece and an open return
--
-- Bills go through the same database functions as the billing screen
-- (pos_checkout etc.), so totals, GST, stock and stock history are real.
-- Run once, in the Supabase SQL editor, after every migration and first_owner.sql.

do $$
declare
  v_photo text := 'https://ksyyrfhdznxktlwthmjv.supabase.co/storage/v1/object/public/product-images/demo/';
  v_owner uuid;
  v_owner_staff uuid;
  v_ravi uuid;
  v_ravi_staff uuid;
  v_sana uuid;
  v_sana_staff uuid;
  v_cat_tee uuid;
  v_cat_shirt uuid;
  v_cat_jeans uuid;
  v_pid uuid;
  v_biz uuid;
  v_customers uuid[] := '{}';
  v_id uuid;
  r record;
  -- bills
  d integer;
  k integer;
  n integer;
  v_at timestamptz;
  v_items jsonb;
  v_used uuid[];
  v_var public.product_variants;
  v_lines integer;
  v_qty integer;
  v_sub numeric;
  v_disc numeric;
  v_reason text;
  v_taxable numeric;
  v_rate numeric;
  v_total numeric;
  v_pay jsonb;
  v_pick numeric;
  v_tender numeric;
  v_customer uuid;
  v_gstin text;
  v_staff_user uuid;
  v_staff_row uuid;
  v_bill public.pos_bills;
  v_void_bill uuid;
  v_return_item public.pos_bill_items;
  v_times text[] := array['10:40', '12:05', '13:30', '15:10', '16:45'];
begin
  if to_regclass('public.demo_seed_rows') is not null then
    raise exception 'Sample data is already loaded. Remove it first with db/demo/remove_demo.sql.';
  end if;

  select user_id, id into v_owner, v_owner_staff from public.pos_staff
  where role = 'OWNER' and is_active order by created_at limit 1;
  if v_owner is null then
    raise exception 'Make the owner login first (db/first_owner.sql).';
  end if;

  -- Every sample row is listed here, so remove_demo.sql deletes exactly these.
  create table public.demo_seed_rows (tbl text not null, id uuid not null, primary key (tbl, id));
  alter table public.demo_seed_rows enable row level security;
  revoke all on public.demo_seed_rows from anon, authenticated;

  -- ---------------------------------------------------------------- staff
  v_ravi := public.pos_create_auth_login('ravi@pos.originstreets.in', 'ravi1234', 'Ravi Kumar');
  insert into public.user_roles (user_id, role) values (v_ravi, 'staff');
  insert into public.pos_staff (user_id, display_name, role, permissions)
  values (v_ravi, 'Ravi Kumar', 'BILLING', array['DASHBOARD', 'BILLING', 'BILLS', 'CUSTOMERS'])
  returning id into v_ravi_staff;

  v_sana := public.pos_create_auth_login('sana@pos.originstreets.in', 'sana1234', 'Sana Shaik');
  insert into public.user_roles (user_id, role) values (v_sana, 'admin');
  insert into public.pos_staff (user_id, display_name, role, permissions)
  values (v_sana, 'Sana Shaik', 'MANAGER', array['DASHBOARD', 'BILLING', 'BILLS', 'TAGS', 'AUDIT', 'MONTHLY_BILLS', 'PRODUCTS', 'CUSTOMERS'])
  returning id into v_sana_staff;

  insert into public.demo_seed_rows values ('auth.users', v_ravi), ('auth.users', v_sana);
  update public.pos_staff set created_at = '2026-10-27 10:00+05:30' where id in (v_ravi_staff, v_sana_staff);

  -- The rest is done as the owner, so every permission check passes as in the app.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------- categories + sizes
  insert into public.categories (name, slug, sort_order, created_at) values ('T-Shirts', 't-shirts-sample', 0, '2026-10-27 11:00+05:30') returning id into v_cat_tee;
  insert into public.categories (name, slug, sort_order, created_at) values ('Shirts', 'shirts-sample', 1, '2026-10-27 11:00+05:30') returning id into v_cat_shirt;
  insert into public.categories (name, slug, sort_order, created_at) values ('Jeans', 'jeans-sample', 2, '2026-10-27 11:00+05:30') returning id into v_cat_jeans;
  insert into public.demo_seed_rows values ('categories', v_cat_tee), ('categories', v_cat_shirt), ('categories', v_cat_jeans);

  insert into public.category_sizes (category_id, size, sort_order)
  select v_cat_tee, s, o - 1 from unnest(array['S', 'M', 'L', 'XL', 'XXL']) with ordinality u(s, o);
  insert into public.category_sizes (category_id, size, sort_order)
  select v_cat_shirt, s, o - 1 from unnest(array['38', '40', '42', '44']) with ordinality u(s, o);
  insert into public.category_sizes (category_id, size, sort_order)
  select v_cat_jeans, s, o - 1 from unnest(array['28', '30', '32', '34', '36']) with ordinality u(s, o);

  -- ---------------------------------------------------------------- products
  -- name, category, price, description, colour x size rows (XXL costs more on the box tee)
  for r in
    select * from (values
      ('Box Logo Tee', v_cat_tee, 1099, 'Heavy cotton tee with the ORIGIN box print.',
       '[{"color":"Black","size":"S","stock":8},{"color":"Black","size":"M","stock":14},{"color":"Black","size":"L","stock":12},{"color":"Black","size":"XL","stock":6},{"color":"Black","size":"XXL","stock":3,"price":1199},
         {"color":"White","size":"S","stock":5},{"color":"White","size":"M","stock":10},{"color":"White","size":"L","stock":9},{"color":"White","size":"XL","stock":4},{"color":"White","size":"XXL","stock":2,"price":1199},
         {"color":"Red","size":"S","stock":3},{"color":"Red","size":"M","stock":6},{"color":"Red","size":"L","stock":5},{"color":"Red","size":"XL","stock":2},{"color":"Red","size":"XXL","stock":0,"price":1199}]'),
      ('Vizag Skyline Oversized Tee', v_cat_tee, 1299, 'Drop-shoulder oversized fit, city skyline print.',
       '[{"color":"Black","size":"M","stock":9},{"color":"Black","size":"L","stock":11},{"color":"Black","size":"XL","stock":7},{"color":"Black","size":"XXL","stock":4},
         {"color":"Off White","size":"M","stock":6},{"color":"Off White","size":"L","stock":8},{"color":"Off White","size":"XL","stock":5},{"color":"Off White","size":"XXL","stock":1}]'),
      ('Street Culture Graphic Tee', v_cat_tee, 999, 'Regular fit tee with the Street Culture print.',
       '[{"color":"Grey","size":"S","stock":4},{"color":"Grey","size":"M","stock":7},{"color":"Grey","size":"L","stock":6},{"color":"Grey","size":"XL","stock":3},
         {"color":"Black","size":"S","stock":6},{"color":"Black","size":"M","stock":9},{"color":"Black","size":"L","stock":8},{"color":"Black","size":"XL","stock":5}]'),
      ('Linen Resort Shirt', v_cat_shirt, 1799, 'Half-sleeve linen blend with a camp collar.',
       '[{"color":"Sand","size":"38","stock":4},{"color":"Sand","size":"40","stock":6},{"color":"Sand","size":"42","stock":5},{"color":"Sand","size":"44","stock":2},
         {"color":"Olive","size":"38","stock":3},{"color":"Olive","size":"40","stock":5},{"color":"Olive","size":"42","stock":4},{"color":"Olive","size":"44","stock":1}]'),
      ('Corduroy Overshirt', v_cat_shirt, 2299, 'Fine-wale corduroy with two chest pockets.',
       '[{"color":"Brown","size":"40","stock":5},{"color":"Brown","size":"42","stock":4},{"color":"Brown","size":"44","stock":2},
         {"color":"Black","size":"40","stock":4},{"color":"Black","size":"42","stock":5},{"color":"Black","size":"44","stock":3}]'),
      ('Oxford Button-Down', v_cat_shirt, 1599, 'Full-sleeve oxford cotton, button-down collar.',
       '[{"color":"White","size":"38","stock":6},{"color":"White","size":"40","stock":8},{"color":"White","size":"42","stock":5},
         {"color":"Sky Blue","size":"38","stock":4},{"color":"Sky Blue","size":"40","stock":7},{"color":"Sky Blue","size":"42","stock":4}]'),
      ('Baggy Fit Jeans', v_cat_jeans, 2499, 'Relaxed baggy fit, 13 oz denim.',
       '[{"color":"Indigo","size":"28","stock":3},{"color":"Indigo","size":"30","stock":7},{"color":"Indigo","size":"32","stock":9},{"color":"Indigo","size":"34","stock":6},{"color":"Indigo","size":"36","stock":2},
         {"color":"Black","size":"28","stock":2},{"color":"Black","size":"30","stock":5},{"color":"Black","size":"32","stock":7},{"color":"Black","size":"34","stock":4},{"color":"Black","size":"36","stock":1}]'),
      ('Straight Fit Selvedge', v_cat_jeans, 2799, 'Straight leg, raw selvedge denim.',
       '[{"color":"Raw Indigo","size":"30","stock":4},{"color":"Raw Indigo","size":"32","stock":6},{"color":"Raw Indigo","size":"34","stock":3}]'),
      ('Carpenter Denim', v_cat_jeans, 2199, 'Workwear carpenter jeans with a hammer loop.',
       '[{"color":"Washed Blue","size":"28","stock":3},{"color":"Washed Blue","size":"30","stock":5},{"color":"Washed Blue","size":"32","stock":6},{"color":"Washed Blue","size":"34","stock":4},
         {"color":"Grey","size":"28","stock":2},{"color":"Grey","size":"30","stock":3},{"color":"Grey","size":"32","stock":4},{"color":"Grey","size":"34","stock":2}]')
    ) as t(name, category_id, price, description, variants)
  loop
    v_pid := public.pos_create_product(
      jsonb_build_object('name', r.name, 'category_id', r.category_id, 'price', r.price, 'description', r.description),
      r.variants::jsonb,
      v_owner_staff
    );
    update public.products
    set images = array[v_photo || slug || '.jpg'], created_at = '2026-10-28 11:00+05:30'
    where id = v_pid;
    update public.pos_inventory_logs set created_at = '2026-10-28 11:00+05:30' where product_id = v_pid;
    insert into public.demo_seed_rows values ('products', v_pid);
  end loop;

  -- Colour swatches, as if each colour had been picked on the colour wheel.
  update public.product_variants v
  set color_hex = c.hex
  from (values
    ('Black', '#1C1C1C'), ('White', '#F6F6F3'), ('Red', '#D3241C'), ('Off White', '#ECE6D8'), ('Grey', '#8C9096'),
    ('Sand', '#CDB892'), ('Olive', '#6A7045'), ('Brown', '#6C4A32'), ('Sky Blue', '#A8C4E6'), ('Indigo', '#2D3A5C'),
    ('Raw Indigo', '#1E2640'), ('Washed Blue', '#7D9BC0')
  ) as c(name, hex)
  where v.color = c.name
    and v.product_id in (select id from public.demo_seed_rows where tbl = 'products');

  -- ---------------------------------------------------------------- customers
  for r in
    select * from (values
      ('Rahul Varma', '9000000001', 'MVP Colony', '2026-10-30'),
      ('Sneha Reddy', '9000000002', 'Seethammadhara', '2026-11-02'),
      ('Arjun Naidu', '9000000003', 'Gajuwaka', '2026-11-04'),
      ('Divya Prasad', '9000000004', 'Madhurawada', '2026-11-06'),
      ('Kiran Kumar', '9000000005', 'Dwaraka Nagar', '2026-11-09'),
      ('Meghana Rao', '9000000006', 'Venkojipalem', '2026-11-12'),
      ('Vikram Chowdary', '9000000007', 'Rushikonda', '2026-11-15')
    ) as t(name, phone, area, since)
  loop
    insert into public.pos_customers (name, phone, address, city, created_at)
    values (r.name, r.phone, r.area, 'Visakhapatnam', (r.since || ' 12:00+05:30')::timestamptz)
    returning id into v_id;
    v_customers := v_customers || v_id;
    insert into public.demo_seed_rows values ('pos_customers', v_id);
  end loop;

  insert into public.pos_customers (name, phone, email, address, city, gstin, created_at)
  values ('Lakshmi Traders', '9000000008', 'accounts@lakshmitraders.example', 'Dabagardens', 'Visakhapatnam', '37AAACL1234F1Z5', '2026-11-05 12:00+05:30')
  returning id into v_biz;
  insert into public.demo_seed_rows values ('pos_customers', v_biz);

  -- ---------------------------------------------------------------- bills, 1 Nov - today
  perform setseed(0.26);
  for d in 1..25 loop
    n := case when d = 25 then 5 else 1 + (d % 4) end;
    for k in 1..n loop
      v_at := (format('2026-11-%s %s', lpad(d::text, 2, '0'), v_times[k]) || '+05:30')::timestamptz
              + make_interval(mins => floor(random() * 20)::int);

      -- Who made the bill: owner, Ravi or Sana in turn (each signs in as themselves).
      case (d + k) % 3
        when 0 then v_staff_user := v_owner; v_staff_row := v_owner_staff;
        when 1 then v_staff_user := v_ravi; v_staff_row := v_ravi_staff;
        else v_staff_user := v_sana; v_staff_row := v_sana_staff;
      end case;
      perform set_config('request.jwt.claims', json_build_object('sub', v_staff_user, 'role', 'authenticated')::text, true);

      -- 1-3 lines from what is in stock.
      v_items := '[]'::jsonb;
      v_used := '{}';
      v_sub := 0;
      v_lines := 1 + floor(random() * 3)::int;
      for i in 1..v_lines loop
        select v.* into v_var
        from public.product_variants v
        join public.demo_seed_rows s on s.tbl = 'products' and s.id = v.product_id
        where v.stock >= 3 and not (v.id = any (v_used))
        order by random()
        limit 1;
        exit when v_var.id is null;
        v_qty := case when random() < 0.2 then 2 else 1 end;
        v_used := v_used || v_var.id;
        v_items := v_items || jsonb_build_array(jsonb_build_object('variant_id', v_var.id, 'qty', v_qty, 'unit_price', v_var.price, 'item_discount', 0));
        v_sub := v_sub + v_var.price * v_qty;
      end loop;
      continue when jsonb_array_length(v_items) = 0;

      -- Some regulars get a discount.
      v_disc := 0;
      v_reason := null;
      if random() < 0.2 then
        v_disc := round(v_sub * 0.10 / 10) * 10;
        v_reason := case when random() < 0.5 then 'Regular customer' else 'Festive offer' end;
      end if;

      -- Walk-in, a saved customer, or (twice) the business customer with GST.
      v_customer := null;
      v_gstin := null;
      if d in (8, 19) and k = 1 then
        v_customer := v_biz;
        v_gstin := '37AAACL1234F1Z5';
      elsif random() < 0.45 then
        v_customer := v_customers[1 + floor(random() * array_length(v_customers, 1))::int];
      end if;

      -- Same total the database will work out (GST slab on the amount after discount).
      v_taxable := v_sub - v_disc;
      v_rate := public.pos_slab_tax_rate(v_taxable);
      v_total := v_taxable + round(v_taxable * v_rate / 100);

      v_pick := random();
      if v_pick < 0.40 then
        v_tender := ceil(v_total / 100) * 100;
        v_pay := jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', v_total, 'tendered', v_tender, 'change_amount', v_tender - v_total));
      elsif v_pick < 0.85 then
        v_pay := jsonb_build_array(jsonb_build_object('method', 'UPI', 'amount', v_total));
      elsif v_pick < 0.95 then
        v_pay := jsonb_build_array(jsonb_build_object('method', 'CARD', 'amount', v_total));
      else
        v_pay := jsonb_build_array(
          jsonb_build_object('method', 'CASH', 'amount', round(v_total / 2), 'tendered', round(v_total / 2), 'change_amount', 0),
          jsonb_build_object('method', 'UPI', 'amount', v_total - round(v_total / 2))
        );
      end if;

      v_bill := public.pos_checkout(v_items, v_customer, v_staff_row, v_disc, v_reason, 0, v_pay, null, null, v_gstin);

      update public.pos_bills set created_at = v_at where id = v_bill.id;
      update public.pos_bill_items set created_at = v_at where bill_id = v_bill.id;
      update public.pos_payment_transactions set created_at = v_at where bill_id = v_bill.id;
      update public.pos_inventory_logs set created_at = v_at where bill_id = v_bill.id;
      insert into public.demo_seed_rows values ('pos_bills', v_bill.id);

      if d = 12 and k = 1 then
        v_void_bill := v_bill.id;
      end if;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------- one cancelled bill
  if v_void_bill is not null then
    perform public.pos_void_bill(v_void_bill, v_owner_staff, 'Customer changed mind');
    update public.pos_inventory_logs
    set created_at = (select created_at + interval '40 minutes' from public.pos_bills where id = v_void_bill)
    where bill_id = v_void_bill and reason = 'VOID';
  end if;

  -- ---------------------------------------------------------------- an open return
  select i.* into v_return_item
  from public.pos_bill_items i
  join public.pos_bills b on b.id = i.bill_id
  join public.demo_seed_rows s on s.tbl = 'pos_bills' and s.id = b.id
  where b.status = 'COMPLETED' and b.created_at::date = date '2026-11-20'
  order by b.created_at
  limit 1;
  if v_return_item.id is not null then
    insert into public.pos_returns (bill_id, bill_item_id, qty, reason, condition, refund_amount, staff_id, created_at)
    values (v_return_item.bill_id, v_return_item.id, 1, 'Size exchange - wants one size bigger', 'Unused, tags on',
            v_return_item.unit_price, v_ravi_staff, '2026-11-21 13:15+05:30')
    returning id into v_id;
    insert into public.demo_seed_rows values ('pos_returns', v_id);
  end if;

  -- ---------------------------------------------------------------- a restock and a damaged piece
  select v.id into v_id from public.product_variants v join public.products p on p.id = v.product_id
  where p.name = 'Box Logo Tee' and v.color = 'Black' and v.size = 'M';
  perform public.pos_adjust_stock(v_id, 12, 'RESTOCK', v_owner_staff, 'New batch from the printer');
  update public.pos_inventory_logs set created_at = '2026-11-15 14:00+05:30'
  where variant_id = v_id and reason = 'RESTOCK' and note = 'New batch from the printer';

  select v.id into v_id from public.product_variants v join public.products p on p.id = v.product_id
  where p.name = 'Box Logo Tee' and v.color = 'White' and v.size = 'S';
  perform public.pos_adjust_stock(v_id, -1, 'DAMAGED', v_sana_staff, 'Stain on the front');
  update public.pos_inventory_logs set created_at = '2026-11-18 17:20+05:30'
  where variant_id = v_id and reason = 'DAMAGED' and note = 'Stain on the front';

  perform set_config('request.jwt.claims', '', true);
end;
$$;
