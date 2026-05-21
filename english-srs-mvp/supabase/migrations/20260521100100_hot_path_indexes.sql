-- Add indexes for API hot paths (M1). These filtered columns were
-- unindexed and degraded to sequential scans as rows accumulate.

create index if not exists idx_analysis_issues_submission
  on public.analysis_issues (submission_id, user_id);
create index if not exists idx_lt_evidence_issue
  on public.learning_target_evidence (analysis_issue_id);
create index if not exists idx_lt_evidence_target
  on public.learning_target_evidence (learning_target_id);
create index if not exists idx_cards_source_submission
  on public.cards (source_submission_id, user_id);
create index if not exists idx_reviews_user_created
  on public.reviews (user_id, created_at desc);
