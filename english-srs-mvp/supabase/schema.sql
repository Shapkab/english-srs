-- Core schema for English SRS MVP

create extension if not exists pgcrypto;

create table if not exists users_profile (
  id uuid primary key,
  email text not null unique,
  timezone text,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profile(id) on delete cascade,
  source_type text not null check (source_type in ('text')),
  original_text text not null,
  language text not null default 'en' check (language in ('en')),
  status text not null default 'pending' check (status in ('pending','analyzed','failed')),
  created_at timestamptz not null default now()
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  user_id uuid not null references users_profile(id) on delete cascade,
  model text not null,
  corrected_text text not null,
  summary text,
  schema_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists analysis_issues (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  user_id uuid not null references users_profile(id) on delete cascade,
  error_text text not null,
  corrected_text text not null,
  category text not null,
  subcategory text,
  explanation_short text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  severity integer not null check (severity between 1 and 5),
  teachability integer not null check (teachability between 1 and 5),
  should_create_card boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists learning_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profile(id) on delete cascade,
  canonical_key text not null,
  display_title text not null,
  category text not null,
  subcategory text,
  explanation_short text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1,
  active_card_count integer not null default 0,
  mastery_score integer not null default 0 check (mastery_score between 0 and 100),
  status text not null default 'active' check (status in ('active','mastering','mastered','ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_key)
);

create table if not exists learning_target_evidence (
  id uuid primary key default gen_random_uuid(),
  learning_target_id uuid not null references learning_targets(id) on delete cascade,
  analysis_issue_id uuid not null references analysis_issues(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  user_id uuid not null references users_profile(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users_profile(id) on delete cascade,
  learning_target_id uuid not null references learning_targets(id) on delete cascade,
  source_submission_id uuid references submissions(id) on delete set null,
  card_type text not null check (card_type in ('correction','cloze','choice','usage')),
  front text not null,
  back text not null,
  hint text,
  example text,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  priority integer not null default 50 check (priority between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists srs_state (
  card_id uuid primary key references cards(id) on delete cascade,
  user_id uuid not null references users_profile(id) on delete cascade,
  repetition integer not null default 0,
  interval_days integer not null default 0,
  ease_factor numeric not null default 2.5,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  lapse_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references users_profile(id) on delete cascade,
  rating integer not null check (rating between 0 and 5),
  response_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists card_feedback (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references users_profile(id) on delete cascade,
  type text not null check (type in ('not_useful','duplicate','too_easy','too_hard','wrong')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('analyze_submission')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_submissions_user_created on submissions(user_id, created_at desc);
create index if not exists idx_jobs_status_available on jobs(status, available_at);
create index if not exists idx_srs_state_user_due on srs_state(user_id, due_at);
create index if not exists idx_learning_targets_user_status on learning_targets(user_id, status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_learning_targets_updated_at
before update on learning_targets
for each row execute procedure set_updated_at();

create trigger trg_cards_updated_at
before update on cards
for each row execute procedure set_updated_at();

create trigger trg_srs_state_updated_at
before update on srs_state
for each row execute procedure set_updated_at();

-- Row-Level Security (mirrors migrations/003_rls.sql).

alter table users_profile enable row level security;
alter table users_profile force row level security;

drop policy if exists users_profile_select_own on users_profile;
create policy users_profile_select_own on users_profile
  for select using (id = auth.uid());

drop policy if exists users_profile_insert_own on users_profile;
create policy users_profile_insert_own on users_profile
  for insert with check (id = auth.uid());

drop policy if exists users_profile_update_own on users_profile;
create policy users_profile_update_own on users_profile
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_profile_delete_own on users_profile;
create policy users_profile_delete_own on users_profile
  for delete using (id = auth.uid());

alter table submissions enable row level security;
alter table submissions force row level security;

drop policy if exists submissions_select_own on submissions;
create policy submissions_select_own on submissions
  for select using (user_id = auth.uid());

drop policy if exists submissions_insert_own on submissions;
create policy submissions_insert_own on submissions
  for insert with check (user_id = auth.uid());

drop policy if exists submissions_update_own on submissions;
create policy submissions_update_own on submissions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists submissions_delete_own on submissions;
create policy submissions_delete_own on submissions
  for delete using (user_id = auth.uid());

alter table analyses enable row level security;
alter table analyses force row level security;

drop policy if exists analyses_select_own on analyses;
create policy analyses_select_own on analyses
  for select using (user_id = auth.uid());

drop policy if exists analyses_insert_own on analyses;
create policy analyses_insert_own on analyses
  for insert with check (user_id = auth.uid());

drop policy if exists analyses_update_own on analyses;
create policy analyses_update_own on analyses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists analyses_delete_own on analyses;
create policy analyses_delete_own on analyses
  for delete using (user_id = auth.uid());

alter table analysis_issues enable row level security;
alter table analysis_issues force row level security;

drop policy if exists analysis_issues_select_own on analysis_issues;
create policy analysis_issues_select_own on analysis_issues
  for select using (user_id = auth.uid());

drop policy if exists analysis_issues_insert_own on analysis_issues;
create policy analysis_issues_insert_own on analysis_issues
  for insert with check (user_id = auth.uid());

drop policy if exists analysis_issues_update_own on analysis_issues;
create policy analysis_issues_update_own on analysis_issues
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists analysis_issues_delete_own on analysis_issues;
create policy analysis_issues_delete_own on analysis_issues
  for delete using (user_id = auth.uid());

alter table learning_targets enable row level security;
alter table learning_targets force row level security;

drop policy if exists learning_targets_select_own on learning_targets;
create policy learning_targets_select_own on learning_targets
  for select using (user_id = auth.uid());

drop policy if exists learning_targets_insert_own on learning_targets;
create policy learning_targets_insert_own on learning_targets
  for insert with check (user_id = auth.uid());

drop policy if exists learning_targets_update_own on learning_targets;
create policy learning_targets_update_own on learning_targets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists learning_targets_delete_own on learning_targets;
create policy learning_targets_delete_own on learning_targets
  for delete using (user_id = auth.uid());

alter table learning_target_evidence enable row level security;
alter table learning_target_evidence force row level security;

drop policy if exists learning_target_evidence_select_own on learning_target_evidence;
create policy learning_target_evidence_select_own on learning_target_evidence
  for select using (user_id = auth.uid());

drop policy if exists learning_target_evidence_insert_own on learning_target_evidence;
create policy learning_target_evidence_insert_own on learning_target_evidence
  for insert with check (user_id = auth.uid());

drop policy if exists learning_target_evidence_update_own on learning_target_evidence;
create policy learning_target_evidence_update_own on learning_target_evidence
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists learning_target_evidence_delete_own on learning_target_evidence;
create policy learning_target_evidence_delete_own on learning_target_evidence
  for delete using (user_id = auth.uid());

alter table cards enable row level security;
alter table cards force row level security;

drop policy if exists cards_select_own on cards;
create policy cards_select_own on cards
  for select using (user_id = auth.uid());

drop policy if exists cards_insert_own on cards;
create policy cards_insert_own on cards
  for insert with check (user_id = auth.uid());

drop policy if exists cards_update_own on cards;
create policy cards_update_own on cards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cards_delete_own on cards;
create policy cards_delete_own on cards
  for delete using (user_id = auth.uid());

alter table srs_state enable row level security;
alter table srs_state force row level security;

drop policy if exists srs_state_select_own on srs_state;
create policy srs_state_select_own on srs_state
  for select using (user_id = auth.uid());

drop policy if exists srs_state_insert_own on srs_state;
create policy srs_state_insert_own on srs_state
  for insert with check (user_id = auth.uid());

drop policy if exists srs_state_update_own on srs_state;
create policy srs_state_update_own on srs_state
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists srs_state_delete_own on srs_state;
create policy srs_state_delete_own on srs_state
  for delete using (user_id = auth.uid());

alter table reviews enable row level security;
alter table reviews force row level security;

drop policy if exists reviews_select_own on reviews;
create policy reviews_select_own on reviews
  for select using (user_id = auth.uid());

drop policy if exists reviews_insert_own on reviews;
create policy reviews_insert_own on reviews
  for insert with check (user_id = auth.uid());

drop policy if exists reviews_update_own on reviews;
create policy reviews_update_own on reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reviews_delete_own on reviews;
create policy reviews_delete_own on reviews
  for delete using (user_id = auth.uid());

alter table card_feedback enable row level security;
alter table card_feedback force row level security;

drop policy if exists card_feedback_select_own on card_feedback;
create policy card_feedback_select_own on card_feedback
  for select using (user_id = auth.uid());

drop policy if exists card_feedback_insert_own on card_feedback;
create policy card_feedback_insert_own on card_feedback
  for insert with check (user_id = auth.uid());

drop policy if exists card_feedback_update_own on card_feedback;
create policy card_feedback_update_own on card_feedback
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists card_feedback_delete_own on card_feedback;
create policy card_feedback_delete_own on card_feedback
  for delete using (user_id = auth.uid());

revoke all on jobs from anon, authenticated;
alter table jobs enable row level security;
alter table jobs force row level security;

-- Auto-seed users_profile on auth.users insert (mirrors
-- migrations/004_users_profile_trigger.sql).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users_profile (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Atomic write path for the analysis pipeline (mirrors
-- migrations/005_persist_submission_analysis.sql).

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

grant execute on function public.persist_submission_analysis(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated, service_role;

-- Atomic write path for review submission (mirrors
-- migrations/006_record_review.sql).

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
