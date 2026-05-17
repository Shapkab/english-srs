-- Adds the merge-targets vocabulary the schema was missing:
--
-- 1. learning_targets.merged_into_id self-FK (composite, scoped to user).
-- 2. merge_learning_targets(from, into, user) RPC under SECURITY DEFINER
--    with admin-only access posture.
-- 3. A one-line follow-through inside persist_submission_analysis so the
--    next analysis that canonical-keys to a merged-away row creates cards
--    under the into-row, not the merged-from row.
--
-- Closes the "normalizer regression leaves duplicate targets forever" hole.

-- 1. Self-FK column.
alter table public.learning_targets
  add column if not exists merged_into_id uuid;

alter table public.learning_targets
  add constraint learning_targets_merged_into_id_user_id_fkey
    foreign key (merged_into_id, user_id)
    references public.learning_targets (id, user_id)
    on delete set null;

create index if not exists idx_learning_targets_merged_into_id
  on public.learning_targets (merged_into_id)
  where merged_into_id is not null;

-- 2. Admin-only merge RPC.
create or replace function public.merge_learning_targets(
  p_from_id uuid,
  p_into_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from_owner uuid;
  v_into_owner uuid;
  v_from_merged uuid;
begin
  if p_from_id = p_into_id then
    raise exception 'cannot merge a learning_target into itself'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Lock both rows to make the re-point atomic vs. concurrent inserts.
  select user_id, merged_into_id into v_from_owner, v_from_merged
    from public.learning_targets
   where id = p_from_id
   for update;
  if not found or v_from_owner <> p_user_id then
    raise exception 'from learning_target not found or not owned by user'
      using errcode = 'insufficient_privilege';
  end if;

  if v_from_merged is not null then
    raise exception 'from learning_target already merged'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select user_id into v_into_owner
    from public.learning_targets
   where id = p_into_id
   for update;
  if not found or v_into_owner <> p_user_id then
    raise exception 'into learning_target not found or not owned by user'
      using errcode = 'insufficient_privilege';
  end if;

  update public.cards
     set learning_target_id = p_into_id
   where learning_target_id = p_from_id and user_id = p_user_id;

  update public.learning_target_evidence
     set learning_target_id = p_into_id
   where learning_target_id = p_from_id and user_id = p_user_id;

  update public.learning_targets
     set merged_into_id = p_into_id,
         status = 'ignored'
   where id = p_from_id and user_id = p_user_id;
end $$;

revoke all on function public.merge_learning_targets(uuid, uuid, uuid) from public;
revoke all on function public.merge_learning_targets(uuid, uuid, uuid) from authenticated;
revoke all on function public.merge_learning_targets(uuid, uuid, uuid) from anon;

-- 3. Normalizer follow-through: when persist_submission_analysis upserts a
--    learning_target by (user_id, canonical_key) and the matching row is a
--    merged-away one, chain-follow to the into-row so cards + evidence land
--    on the correct target. Re-states the full function body (unchanged
--    except for the one chain-follow after the upsert RETURNING).

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

  select count(*) into v_owner_count
    from public.submissions
   where id = p_submission_id and user_id = p_user_id;
  if v_owner_count = 0 then
    raise exception 'submission % not owned by user %', p_submission_id, p_user_id
      using errcode = 'insufficient_privilege';
  end if;

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

  insert into public.analyses (
    submission_id, user_id, model, corrected_text, summary, schema_version
  )
  values (p_submission_id, p_user_id, p_model, p_corrected_text, p_summary, p_schema_version)
  returning id into v_analysis_id;

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

    -- Merge follow-through: if the upsert matched a merged-away row, the
    -- canonical_key now belongs to the into-row. Re-point v_lt_id so the
    -- evidence row + downstream cards land on the survivor.
    if v_lt_id is not null then
      select coalesce(t.merged_into_id, t.id) into v_lt_id
        from public.learning_targets t
       where t.id = v_lt_id and t.user_id = p_user_id;
    end if;

    v_lt_ids := array_append(v_lt_ids, v_lt_id);

    insert into public.learning_target_evidence (
      learning_target_id, analysis_issue_id, submission_id, user_id
    )
    values (v_lt_id, v_issue_ids[v_idx + 1], p_submission_id, p_user_id);
  end loop;

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

  update public.submissions set status = 'analyzed'
   where id = p_submission_id and user_id = p_user_id;

  return query select v_analysis_id, v_issue_ids, v_card_ids;
end;
$$;
