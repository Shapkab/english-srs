-- Repair remote schema drift: the jobs table was created on some
-- environments from an older init.sql whose `create table jobs` block
-- predated the `last_error` column. `if not exists` then prevented the
-- column from ever being back-filled. The jobs_dead_letter view
-- (20260521100300) selects last_error, so ensure the column exists.
-- Idempotent and harmless where the column is already present.

alter table public.jobs add column if not exists last_error text;
