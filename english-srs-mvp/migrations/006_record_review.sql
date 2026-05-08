-- Atomic write path for review submission (R-004).
--
-- Closes the split-brain in app/api/v1/reviews/route.ts where a successful
-- reviews insert followed by a failed srs_state update left the queue out
-- of sync with the review log. Both rows now write inside one plpgsql
-- transaction.

create or replace function public.record_review(
  p_card_id          uuid,
  p_user_id          uuid,
  p_rating           int,
  p_response_ms      int,
  p_repetition       int,
  p_interval_days    int,
  p_ease_factor      numeric,
  p_lapse_count      int,
  p_due_at           timestamptz,
  p_last_reviewed_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state_count int;
begin
  if p_card_id is null or p_user_id is null then
    raise exception 'card_id and user_id are required'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Existence + ownership check.
  select count(*) into v_state_count
    from public.srs_state
   where card_id = p_card_id and user_id = p_user_id;
  if v_state_count = 0 then
    raise exception 'srs_state for card % not found for user %', p_card_id, p_user_id
      using errcode = 'no_data_found';
  end if;

  insert into public.reviews (card_id, user_id, rating, response_ms)
  values (p_card_id, p_user_id, p_rating, p_response_ms);

  update public.srs_state
     set repetition       = p_repetition,
         interval_days    = p_interval_days,
         ease_factor      = p_ease_factor,
         lapse_count      = p_lapse_count,
         due_at           = p_due_at,
         last_reviewed_at = p_last_reviewed_at
   where card_id = p_card_id and user_id = p_user_id;

  return p_due_at;
end;
$$;

grant execute on function public.record_review(
  uuid, uuid, int, int, int, int, numeric, int, timestamptz, timestamptz
) to authenticated, service_role;
