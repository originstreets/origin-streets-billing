-- db/migrations/0012_vip_setting.sql
-- Who counts as a VIP customer: total spend above this amount (Settings -> Customers).
alter table public.pos_settings
  add column if not exists vip_spend_threshold numeric not null default 40000 check (vip_spend_threshold >= 0);
