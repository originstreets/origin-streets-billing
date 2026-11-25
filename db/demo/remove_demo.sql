-- db/demo/remove_demo.sql
-- Removes the sample data added by db/demo/seed_demo.sql - and nothing else.
-- Real products, bills, customers and staff added since stay as they are.
-- Run it in the Supabase SQL editor before the shop goes live.
--
-- Afterwards, also delete the folder "demo" in Storage -> product-images
-- (the sample photos; Supabase does not let SQL delete stored files).

do $$
begin
  if to_regclass('public.demo_seed_rows') is null then
    raise notice 'No sample data is loaded - nothing to remove.';
    return;
  end if;

  -- Stock history of sample bills and sample products.
  delete from public.pos_inventory_logs
  where bill_id in (select id from public.demo_seed_rows where tbl = 'pos_bills')
     or product_id in (select id from public.demo_seed_rows where tbl = 'products');

  delete from public.pos_returns
  where id in (select id from public.demo_seed_rows where tbl = 'pos_returns')
     or bill_id in (select id from public.demo_seed_rows where tbl = 'pos_bills');

  -- Bills take their lines and payments with them.
  delete from public.pos_bills where id in (select id from public.demo_seed_rows where tbl = 'pos_bills');
  delete from public.pos_customers where id in (select id from public.demo_seed_rows where tbl = 'pos_customers');

  -- Products take their colour x size rows; categories take their sizes.
  delete from public.products where id in (select id from public.demo_seed_rows where tbl = 'products');
  delete from public.categories where id in (select id from public.demo_seed_rows where tbl = 'categories');

  -- Sample staff logins (their staff rows and roles go with them).
  delete from auth.users where id in (select id from public.demo_seed_rows where tbl = 'auth.users');

  -- Bill numbers carry on from the last real bill of each month (or start
  -- again at 0001 when the month has none).
  update public.pos_invoice_counters c
  set last_no = coalesce((
    select max(substring(b.bill_number from '(\d+)$')::int)
    from public.pos_bills b
    where b.bill_number like c.series || '-' || c.period || '-%'
  ), 0);
  delete from public.pos_invoice_counters where last_no = 0;

  drop table public.demo_seed_rows;
  raise notice 'Sample data removed. Delete Storage -> product-images -> demo too.';
end;
$$;
