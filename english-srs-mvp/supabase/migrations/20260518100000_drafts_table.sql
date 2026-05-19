-- Per-user draft persistence. One draft per user (the user can
-- replace it freely). RLS-gated to the owner; no admin posture needed
-- because end users are the only callers.

create table if not exists public.drafts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users_profile(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.drafts enable row level security;
alter table public.drafts force row level security;

create policy drafts_select_own on public.drafts
  for select using (user_id = auth.uid());
create policy drafts_insert_own on public.drafts
  for insert with check (user_id = auth.uid());
create policy drafts_update_own on public.drafts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy drafts_delete_own on public.drafts
  for delete using (user_id = auth.uid());
