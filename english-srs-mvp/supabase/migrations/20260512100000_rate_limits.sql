-- Per-user, per-bucket rate-limit table. Service-role only.
create table if not exists public.rate_limits (
  user_id            uuid        not null references public.users_profile(id) on delete cascade,
  bucket             text        not null,
  count              integer     not null default 0,
  window_started_at  timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on public.rate_limits from anon, authenticated;
-- No policies: deny-all for end-user roles. Service-role bypasses RLS entirely.

-- Atomic check-and-consume. Returns one row with (allowed, remaining, reset_at).
create or replace function public.check_and_consume_rate_limit(
  p_user_id         uuid,
  p_bucket          text,
  p_max             int,
  p_window_seconds  int
) returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cur_count       int;
  cur_started     timestamptz;
  now_ts          timestamptz := now();
  age_seconds     numeric;
begin
  -- Ensure the row exists.
  insert into public.rate_limits (user_id, bucket, count, window_started_at)
    values (p_user_id, p_bucket, 0, now_ts)
    on conflict (user_id, bucket) do nothing;

  -- Lock for atomic read-modify-write.
  select rl.count, rl.window_started_at
    into cur_count, cur_started
  from public.rate_limits rl
  where rl.user_id = p_user_id and rl.bucket = p_bucket
  for update;

  age_seconds := extract(epoch from (now_ts - cur_started));

  -- Reset window if expired.
  if age_seconds >= p_window_seconds then
    cur_count   := 0;
    cur_started := now_ts;
  end if;

  if cur_count >= p_max then
    update public.rate_limits
      set count = cur_count, window_started_at = cur_started
      where user_id = p_user_id and bucket = p_bucket;
    return query
      select false                                                            as allowed,
             0                                                                as remaining,
             cur_started + make_interval(secs => p_window_seconds)            as reset_at;
    return;
  end if;

  update public.rate_limits
    set count = cur_count + 1, window_started_at = cur_started
    where user_id = p_user_id and bucket = p_bucket;

  return query
    select true                                                               as allowed,
           p_max - cur_count - 1                                              as remaining,
           cur_started + make_interval(secs => p_window_seconds)              as reset_at;
end $$;

revoke all on function public.check_and_consume_rate_limit(uuid, text, int, int) from public;
revoke all on function public.check_and_consume_rate_limit(uuid, text, int, int) from anon;
revoke all on function public.check_and_consume_rate_limit(uuid, text, int, int) from authenticated;
-- Worker / routes call via service-role; do NOT grant to authenticated.
