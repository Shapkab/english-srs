-- Atomic write path for the analysis pipeline (R-002, R-006, R-007).
--
-- The function commits everything in one plpgsql transaction; any error
-- inside rolls the whole submission back. Idempotency keys make a retried
-- job converge instead of duplicating or half-applying.

create unique index if not exists analyses_submission_id_uniq
  on public.analyses (submission_id);

create unique index if not exists analysis_issues_unique_per_analysis
  on public.analysis_issues (analysis_id, error_text, corrected_text);

create unique index if not exists cards_unique_per_target_submission_type
  on public.cards (user_id, learning_target_id, source_submission_id, card_type);

create or replace function public.persist_submission_analysis(
  p_submission_id      uuid,
  p_user_id            uuid,
  p_model              text,
  p_corrected_text     text,
  p_summary            text,
  p_schema_version     text,
  p_issues             jsonb,
  p_normalized_targets jsonb,
  p_card_candidates    jsonb
) returns table (
  analysis_id        uuid,
  inserted_issue_ids uuid[],
  created_card_ids   uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_analysis_id uuid;
  v_owner_count int;
  v_issue_ids   uuid[] := '{}';
  v_card_ids    uuid[] := '{}';
  v_lt_ids      uuid[] := '{}';
  v_issue       jsonb;
  v_target      jsonb;
  v_candidate   jsonb;
  v_card        jsonb;
  v_issue_id    uuid;
  v_lt_id       uuid;
  v_card_id     uuid;
  v_issue_idx   int;
  v_idx         int;
begin
  if p_submission_id is null or p_user_id is null then
    raise exception 'submission_id and user_id are required'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Ownership: refuse if the caller's user_id does not own the submission.
  select count(*) into v_owner_count
    from public.submissions
   where id = p_submission_id and user_id = p_user_id;
  if v_owner_count = 0 then
    raise exception 'submission % not owned by user %', p_submission_id, p_user_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent replay: an existing analyses row for this submission means
  -- a prior run already persisted everything; return what is already there
  -- and DO NOT re-insert evidence or bump learning-target counters.
  select id into v_analysis_id
    from public.analyses
   where submission_id = p_submission_id;

  if v_analysis_id is not null then
    select coalesce(array_agg(id order by created_at), '{}'::uuid[])
      into v_issue_ids
      from public.analysis_issues
     where analysis_id = v_analysis_id;

    select coalesce(array_agg(id order by created_at), '{}'::uuid[])
      into v_card_ids
      from public.cards
     where source_submission_id = p_submission_id and user_id = p_user_id;

    return query select v_analysis_id, v_issue_ids, v_card_ids;
    return;
  end if;

  -- Fresh path: insert analyses head row.
  insert into public.analyses (
    submission_id, user_id, model, corrected_text, summary, schema_version
  )
  values (p_submission_id, p_user_id, p_model, p_corrected_text, p_summary, p_schema_version)
  returning id into v_analysis_id;

  -- Issues (parallel to p_issues order; v_issue_ids preserves it).
  for v_idx in 0 .. coalesce(jsonb_array_length(p_issues) - 1, -1) loop
    v_issue := p_issues -> v_idx;

    insert into public.analysis_issues (
      analysis_id, submission_id, user_id,
      error_text, corrected_text, category, subcategory,
      explanation_short, confidence, severity, teachability, should_create_card
    )
    values (
      v_analysis_id, p_submission_id, p_user_id,
      v_issue->>'errorText',
      v_issue->>'correctedText',
      v_issue->>'category',
      v_issue->>'subcategory',
      v_issue->>'explanationShort',
      (v_issue->>'confidence')::numeric,
      (v_issue->>'severity')::int,
      (v_issue->>'teachability')::int,
      (v_issue->>'shouldCreateCard')::boolean
    )
    on conflict (analysis_id, error_text, corrected_text) do update
      set submission_id = excluded.submission_id
    returning id into v_issue_id;

    v_issue_ids := array_append(v_issue_ids, v_issue_id);
  end loop;

  -- Learning targets + evidence (one per issue, parallel order).
  for v_idx in 0 .. coalesce(jsonb_array_length(p_normalized_targets) - 1, -1) loop
    v_target := p_normalized_targets -> v_idx;

    insert into public.learning_targets (
      user_id, canonical_key, display_title, category, subcategory, explanation_short
    )
    values (
      p_user_id,
      v_target->>'canonicalKey',
      v_target->>'displayTitle',
      v_target->>'category',
      v_target->>'subcategory',
      v_target->>'explanationShort'
    )
    on conflict (user_id, canonical_key) do update
      set last_seen_at      = now(),
          seen_count        = public.learning_targets.seen_count + 1,
          explanation_short = excluded.explanation_short
    returning id into v_lt_id;

    v_lt_ids := array_append(v_lt_ids, v_lt_id);

    insert into public.learning_target_evidence (
      learning_target_id, analysis_issue_id, submission_id, user_id
    )
    values (v_lt_id, v_issue_ids[v_idx + 1], p_submission_id, p_user_id);
  end loop;

  -- Cards + initial srs_state. p_card_candidates entries reference the
  -- 0-based index of the issue/target they apply to.
  if p_card_candidates is not null then
    for v_idx in 0 .. coalesce(jsonb_array_length(p_card_candidates) - 1, -1) loop
      v_candidate := p_card_candidates -> v_idx;
      v_issue_idx := (v_candidate->>'issueIndex')::int;
      v_card      := v_candidate -> 'candidate';

      if v_issue_idx is null or v_card is null then
        continue;
      end if;

      v_lt_id := v_lt_ids[v_issue_idx + 1];
      if v_lt_id is null then
        continue;
      end if;

      insert into public.cards (
        user_id, learning_target_id, source_submission_id,
        card_type, front, back, hint, example, priority
      )
      values (
        p_user_id, v_lt_id, p_submission_id,
        v_card->>'cardType',
        v_card->>'front',
        v_card->>'back',
        v_card->>'hint',
        v_card->>'example',
        coalesce((v_card->>'priority')::int, 50)
      )
      on conflict (user_id, learning_target_id, source_submission_id, card_type)
        do nothing
      returning id into v_card_id;

      if v_card_id is not null then
        insert into public.srs_state (
          card_id, user_id, repetition, interval_days, ease_factor, due_at, lapse_count
        )
        values (v_card_id, p_user_id, 0, 0, 2.5, now(), 0);
        v_card_ids := array_append(v_card_ids, v_card_id);
      end if;
    end loop;
  end if;

  -- Flip submission status last so a partial run (rolled back by the
  -- enclosing transaction on raise) leaves the submission as 'pending'.
  update public.submissions set status = 'analyzed'
   where id = p_submission_id and user_id = p_user_id;

  return query select v_analysis_id, v_issue_ids, v_card_ids;
end;
$$;

grant execute on function public.persist_submission_analysis(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated, service_role;
