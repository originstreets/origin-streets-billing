-- db/migrations/0005_staff_logins.sql
-- Staff logins (Settings & staff -> Add staff) are created here, in one
-- step, by the database.
--
-- Why not supabase.auth.signUp from the browser (what Vault 26 used to do):
-- a username like "karthik" becomes the login karthik@pos.originstreets.in.
-- That domain has no mailbox, and Supabase rejects sign-ups to such domains
-- ("email_address_invalid"), so no staff login could ever be made. Here the
-- login is written straight into Supabase Auth, already confirmed, with the
-- role and staff row in the same transaction - nothing is half-created and
-- no email is ever sent.
begin;

-- Internal: one confirmed email + password login. Not callable from the app.
create or replace function public.pos_create_auth_login(p_email text, p_password text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid := gen_random_uuid();
begin
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    raise exception 'The login % is not valid', v_email;
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'The password needs 6 or more characters';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'This username is already taken' using errcode = 'unique_violation';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('name', p_name), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  return v_id;
end;
$$;
revoke all on function public.pos_create_auth_login(text, text, text) from public, anon, authenticated;

-- Owner only. Makes the login, gives it database access (owner/manager ->
-- 'admin', cashier/packing -> 'staff') and the staff row with its screens.
create or replace function public.pos_create_staff_login(
  p_login text,
  p_password text,
  p_display_name text,
  p_role public.pos_role,
  p_permissions text[]
)
returns public.pos_staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_staff public.pos_staff;
begin
  if not public.pos_is_owner() then
    raise exception 'Only the owner can add staff logins';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'The name is needed';
  end if;

  v_user := public.pos_create_auth_login(p_login, p_password, btrim(p_display_name));

  insert into public.user_roles (user_id, role)
  values (v_user, case when p_role in ('OWNER', 'MANAGER') then 'admin' else 'staff' end::public.app_role)
  on conflict (user_id, role) do nothing;

  insert into public.pos_staff (user_id, display_name, role, permissions, is_active)
  values (v_user, btrim(p_display_name), p_role, coalesce(p_permissions, '{}'), true)
  returning * into v_staff;

  return v_staff;
end;
$$;
revoke all on function public.pos_create_staff_login(text, text, text, public.pos_role, text[]) from public, anon;
grant execute on function public.pos_create_staff_login(text, text, text, public.pos_role, text[]) to authenticated;

commit;
