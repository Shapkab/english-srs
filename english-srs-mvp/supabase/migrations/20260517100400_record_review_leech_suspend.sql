-- Wire srs_state.lapse_count -> cards.status='suspended' inside
-- record_review: once a card lapses 8+ times it's a "leech" in SM-2
-- parlance and stays in rotation forever otherwise. Same FOR UPDATE
-- row lock as the existing SRS math; same admin-only access posture.

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

  -- Leech-suspend: once lapse_count crosses 8, take the card out of rotation.
  if new_lapse >= 8 then
    update public.cards
       set status = 'suspended'
     where id = p_card_id and user_id = p_user_id;
  end if;

  return new_due;
end $$;

-- Restate the revoke posture (defensive — create or replace preserves
-- existing ACLs, but this makes the migration self-contained if the
-- function ever gets dropped+recreated outside this file).
revoke all on function public.record_review(uuid, uuid, int, int) from public;
revoke all on function public.record_review(uuid, uuid, int, int) from authenticated;
revoke all on function public.record_review(uuid, uuid, int, int) from anon;
