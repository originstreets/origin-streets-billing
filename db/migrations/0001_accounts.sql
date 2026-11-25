-- db/migrations/0001_accounts.sql
-- Who can use Origin billing.
--
-- user_roles is the database access gate ('admin' = owner/manager, 'staff' =
-- cashier/packing). A pos_staff row decides which billing screens a person
-- sees and which actions they may take (permissions).
--
-- Origin has no website, so unlike Vault 26 these tables are created here
-- instead of being borrowed from a website schema.
begin;

create type public.app_role as enum ('admin', 'staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create type public.pos_role as enum ('OWNER', 'MANAGER', 'BILLING', 'FULFILLMENT');

create table public.pos_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  role public.pos_role not null default 'BILLING',
  is_active boolean not null default true,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Any billing account (owner, manager, cashier, packing staff).
create or replace function public.pos_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'staff')
  );
$$;

-- The named billing permission, or OWNER (never locked out by their own
-- list), or an admin.
create or replace function public.pos_has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pos_staff
    where user_id = auth.uid()
      and is_active = true
      and (perm = any(permissions) or role = 'OWNER')
  )
  or public.has_role(auth.uid(), 'admin');
$$;

-- OWNER only (not MANAGER): editing a settled bill, custom tax rates, staff logins.
create or replace function public.pos_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pos_staff
    where user_id = auth.uid() and role = 'OWNER' and is_active = true
  );
$$;

alter table public.user_roles enable row level security;
alter table public.pos_staff enable row level security;

create policy "roles: self read" on public.user_roles
  for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "roles: admins manage" on public.user_roles
  for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "pos_staff: staff read" on public.pos_staff
  for select using (public.pos_is_staff());
create policy "pos_staff: read own row" on public.pos_staff
  for select using (user_id = auth.uid());
create policy "pos_staff: admins insert" on public.pos_staff
  for insert with check (public.has_role(auth.uid(), 'admin'));
create policy "pos_staff: admins update" on public.pos_staff
  for update using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "pos_staff: admins delete" on public.pos_staff
  for delete using (public.has_role(auth.uid(), 'admin'));

commit;
