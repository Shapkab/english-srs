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

-- jobs claim/retry columns (mirrors migrations/007_jobs_claim_columns.sql).
alter table jobs add column if not exists claimed_at timestamptz;
alter table jobs add column if not exists max_attempts integer not null default 3;
create index if not exists idx_jobs_processing_claimed_at
  on jobs (status, claimed_at)
  where status = 'processing';

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
