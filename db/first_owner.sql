-- db/first_owner.sql
-- Run ONCE, after every file in db/migrations, to give the shop owner the
-- first billing login. After this, the owner adds every other staff login
-- from the app (Settings & staff -> Add staff).
--
-- Replace the three values below (never commit real ones) and run this in
-- the Supabase SQL editor. The owner signs in with the email as username.

do $$
declare
  v_login    text := '<owner email>';     -- e.g. owner@example.com
  v_password text := '<owner password>';  -- 6 or more characters
  v_name     text := 'Owner';             -- name shown in the app
  v_user     uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_login);
  if v_user is null then
    v_user := public.pos_create_auth_login(v_login, v_password, v_name);
  end if;

  insert into public.user_roles (user_id, role) values (v_user, 'admin')
  on conflict (user_id, role) do nothing;

  insert into public.pos_staff (user_id, display_name, role, permissions, is_active)
  values (
    v_user, v_name, 'OWNER',
    array['DASHBOARD','BILLING','BILLS','TAGS','AUDIT','MONTHLY_BILLS','PRODUCTS','CUSTOMERS','SETTINGS'],
    true
  )
  on conflict (user_id) do update
    set role = 'OWNER', is_active = true, display_name = excluded.display_name, permissions = excluded.permissions;
end $$;
