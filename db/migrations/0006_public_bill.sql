-- db/migrations/0006_public_bill.sql
-- The QR code on a printed bill opens <app>/bill/<bill id>, which shows the
-- bill exactly as it was printed. That page is opened by customers who are
-- not signed in, so it reads the bill through this one function instead of
-- the tables (which stay closed to the public).
--
-- It returns a single bill, looked up by its id - a random UUID that is
-- only ever printed on that bill - with what the printed bill already shows:
-- the lines, totals, payments, the customer's name/phone/email and the
-- shop's details. Internal notes and staff are left out.
begin;

create or replace function public.pos_public_bill(p_bill_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'bill', to_jsonb(b) - 'notes' - 'staff_id' - 'pos_customer_id',
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) - 'variant_id' order by i.created_at, i.id)
      from public.pos_bill_items i where i.bill_id = b.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'bill_id', p.bill_id, 'method', p.method, 'amount', p.amount,
        'tendered', p.tendered, 'change_amount', p.change_amount, 'status', p.status, 'created_at', p.created_at
      ) order by p.created_at, p.id)
      from public.pos_payment_transactions p where p.bill_id = b.id
    ), '[]'::jsonb),
    'customer', (
      select jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email)
      from public.pos_customers c where c.id = b.pos_customer_id
    ),
    'shop', coalesce((select s.value from public.settings s where s.key = 'invoice'), '{}'::jsonb)
  )
  from public.pos_bills b
  where b.id = p_bill_id;
$$;

revoke all on function public.pos_public_bill(uuid) from public;
grant execute on function public.pos_public_bill(uuid) to anon, authenticated;

commit;
