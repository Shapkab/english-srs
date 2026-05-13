-- Replace handle_new_auth_user to tolerate auth.users.email IS NULL
-- (OAuth providers that don't return email).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users_profile (id, email)
  values (
    new.id,
    coalesce(new.email, 'noemail+' || new.id::text || '@placeholder.local')
  )
  on conflict (id) do nothing;
  return new;
end $$;
