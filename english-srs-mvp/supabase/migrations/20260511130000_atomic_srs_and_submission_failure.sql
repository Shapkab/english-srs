-- Phase β: move SM-2 math into record_review under FOR UPDATE (M1) and add
-- mark_submission_failed + submissions.failure_reason for terminal-failure
-- propagation from the worker (H3).

-- 1. submissions.failure_reason for H3.
alter table public.submissions
  add column if not exists failure_reason text;

-- 2. mark_submission_failed RPC for H3.
create or replace function public.mark_submission_failed(
  p_submission_id uuid,
  p_user_id       uuid,
  p_reason        text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.submissions
    set status = 'failed', failure_reason = left(coalesce(p_reason, ''), 500)
    where id = p_submission_id and user_id = p_user_id;
  if not found then
    raise exception 'submission not found or not owned by user' using errcode = '42501';
  end if;
end $$;

-- Supabase's default privileges auto-grant EXECUTE on new public functions to
-- authenticated and anon; revoke from all three roles plus PUBLIC so the only
-- callers are service-role (worker) and postgres (admin).
revoke all on function public.mark_submission_failed(uuid, uuid, text) from public;
revoke all on function public.mark_submission_failed(uuid, uuid, text) from authenticated;
revoke all on function public.mark_submission_failed(uuid, uuid, text) from anon;

-- 3. New record_review that takes (card_id, user_id, rating, response_ms) and
--    does SM-2 inside (M1). Drop and recreate to change the signature.
drop function if exists public.record_review(uuid, uuid, int, int, int, int, numeric, int, timestamptz, timestamptz);

create or replace function public.record_review(
  p_card_id     uuid,
  p_user_id     uuid,
  p_rating      int,
  p_response_ms int
) returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s_rep    int;
  s_int    int;
  s_ease   numeric;
  s_lapse  int;
  new_rep  int;
  new_int  int;
  new_ease numeric;
  new_lapse int;
  new_due  timestamptz;
  now_ts   timestamptz := now();
begin
  -- Lock the srs_state row to make this read-modify-write atomic.
  select repetition, interval_days, ease_factor, lapse_count
    into s_rep, s_int, s_ease, s_lapse
  from public.srs_state
  where card_id = p_card_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'srs_state not found or not owned by user' using errcode = '42501';
  end if;

  if p_rating < 3 then
    new_rep := 0;
    new_int := 1;
    new_lapse := s_lapse + 1;
    new_ease := s_ease;
  else
    if s_rep = 0 then new_int := 1;
    elsif s_rep = 1 then new_int := 3;
    else new_int := greatest(1, round(s_int * s_ease)::int);
    end if;
    new_rep := s_rep + 1;
    new_lapse := s_lapse;
    new_ease := greatest(1.3, s_ease + (0.1 - (5 - p_rating) * (0.08 + (5 - p_rating) * 0.02)));
  end if;

  new_due := now_ts + (new_int || ' days')::interval;

  insert into public.reviews (card_id, user_id, rating, response_ms)
    values (p_card_id, p_user_id, p_rating, p_response_ms);

  update public.srs_state
    set repetition = new_rep,
        interval_days = new_int,
        ease_factor = new_ease,
        lapse_count = new_lapse,
        due_at = new_due,
        last_reviewed_at = now_ts
    where card_id = p_card_id and user_id = p_user_id;

  return new_due;
end $$;

-- Same posture as Phase α: worker / admin only. Revoke from public + the
-- default-granted roles (authenticated, anon) explicitly.
revoke all on function public.record_review(uuid, uuid, int, int) from public;
revoke all on function public.record_review(uuid, uuid, int, int) from authenticated;
revoke all on function public.record_review(uuid, uuid, int, int) from anon;
