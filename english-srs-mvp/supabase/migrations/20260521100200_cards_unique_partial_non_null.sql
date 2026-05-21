-- Fix source_submission_id uniqueness / delete collision (M6).
-- The NULLS NOT DISTINCT unique index lets `on delete set null` produce
-- duplicate all-null tuples and block submission deletes. Replace it with
-- a partial unique index that ignores null-sourced cards.

drop index if exists public.cards_unique_per_target_submission_type;
create unique index cards_unique_per_target_submission_type
  on public.cards (user_id, learning_target_id, source_submission_id, card_type)
  where source_submission_id is not null;
