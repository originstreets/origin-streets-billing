-- db/migrations/0009_bill_series_setting.sql
-- The bill number series (ORS in ORS-2611-0001) is set in Settings -> Bill
-- details instead of being fixed. Each series counts on its own, so a new
-- series starts at 0001 and bills already made keep their numbers.
begin;

alter table public.pos_settings
  add constraint pos_settings_invoice_prefix_format check (invoice_prefix ~ '^[A-Z0-9]{2,8}$');

create or replace function public.pos_assign_bill_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series text;
begin
  select upper(btrim(invoice_prefix)) into v_series from public.pos_settings limit 1;
  new.bill_number := public.pos_next_invoice_no(coalesce(nullif(v_series, ''), 'ORS'), coalesce(new.created_at, now()));
  return new;
end;
$$;

commit;
