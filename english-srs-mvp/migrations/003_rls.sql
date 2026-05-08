-- Enable Row-Level Security on every user-scoped table.
-- Service-role key bypasses these via the gateway (intended worker escape hatch).
-- All statements are idempotent so the migration is safe to re-run.

-- users_profile: keyed on id, not user_id.
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

-- submissions
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

-- analyses
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

-- analysis_issues
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

-- learning_targets
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

-- learning_target_evidence
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

-- cards
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

-- srs_state
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

-- reviews
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

-- card_feedback
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

-- jobs: deny-all-by-default. No user_id column; revoke from anon/authenticated
-- so even a stray future grant cannot reach them. Service-role bypass remains
-- intact for the worker.
revoke all on jobs from anon, authenticated;
alter table jobs enable row level security;
alter table jobs force row level security;
