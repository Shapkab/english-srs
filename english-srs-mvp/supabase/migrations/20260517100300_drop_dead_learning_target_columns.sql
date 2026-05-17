-- Both columns ship with default 0 and are never updated by any
-- service or RPC; nothing reads them either. Drop now; re-add when an
-- actual consumer exists. Reversible by a future migration that adds
-- them back with default 0.

alter table public.learning_targets
  drop column if exists mastery_score;

alter table public.learning_targets
  drop column if exists active_card_count;
