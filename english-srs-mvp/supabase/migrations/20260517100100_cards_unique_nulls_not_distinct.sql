-- The existing unique index uses Postgres' default NULLS DISTINCT, which
-- means rows with source_submission_id IS NULL can coexist without limit.
-- Today every cards row has a non-null source_submission_id (the worker
-- always seeds it), but the moment a user-crafted-card path ships, the
-- "one (target, type) per submission" intent breaks. Recreate with
-- NULLS NOT DISTINCT (PG 15+) to make the constraint match the intent.

drop index if exists public.cards_unique_per_target_submission_type;

create unique index cards_unique_per_target_submission_type
  on public.cards (user_id, learning_target_id, source_submission_id, card_type)
  nulls not distinct;
