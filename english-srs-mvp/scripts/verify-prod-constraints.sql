-- ============================================================================
-- Pre-deploy verification for migrations/005_persist_submission_analysis.sql.
--
-- Purpose
--   Phase A's migration 005 introduces three unique indexes on existing
--   tables. If production already contains rows that violate any of them, the
--   migration will fail at index build time. This script flags those rows so
--   the user can deduplicate before deploying.
--
-- When to run
--   Against production (or staging that mirrors prod) BEFORE applying
--   migration 005. Safe to run at any other time too — every statement is a
--   read-only SELECT.
--
-- What to do with results
--   Each query should return zero rows on a conflict-free database. If any
--   query returns rows, deduplicate the offending data manually before
--   migrating; do NOT bypass the constraint. The duplicate rows represent
--   real data inconsistencies the migration is meant to prevent going forward.
-- ============================================================================

-- 1. Phase A migration 005: unique (submission_id) on analyses.
select submission_id, count(*) as analyses_count
from public.analyses
group by submission_id
having count(*) > 1
order by analyses_count desc;

-- 2. Phase A migration 005: unique (analysis_id, error_text, corrected_text) on analysis_issues.
select analysis_id, error_text, corrected_text, count(*) as duplicate_count
from public.analysis_issues
group by analysis_id, error_text, corrected_text
having count(*) > 1
order by duplicate_count desc;

-- 3. Phase A migration 005: unique (user_id, learning_target_id, source_submission_id, card_type) on cards.
select user_id, learning_target_id, source_submission_id, card_type, count(*) as duplicate_count
from public.cards
group by user_id, learning_target_id, source_submission_id, card_type
having count(*) > 1
order by duplicate_count desc;
