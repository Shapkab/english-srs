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
