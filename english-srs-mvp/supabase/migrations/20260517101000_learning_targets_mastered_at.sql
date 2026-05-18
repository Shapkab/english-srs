-- Track when a learning target actually transitioned to 'mastered',
-- not just when any field on the row was last touched. /api/v1/stats
-- previously bucketed by updated_at, which counts any change in the
-- period (status flips, seen_count increments, future column edits)
-- rather than the moment of mastery.

alter table public.learning_targets
  add column if not exists mastered_at timestamptz null;

-- Backfill: existing 'mastered' rows take their best available
-- approximation, updated_at. New transitions are exact.
update public.learning_targets
   set mastered_at = updated_at
 where status = 'mastered'
   and mastered_at is null;

-- BEFORE UPDATE row trigger. Project convention reserves security
-- definer for cross-tenant RPCs only; this trigger mutates NEW in the
-- caller's own transaction and needs no privilege escalation.
create or replace function public.set_mastered_at_on_status_change()
returns trigger
language plpgsql
as $$
begin
  if (new.status = 'mastered' and old.status is distinct from 'mastered') then
    new.mastered_at := now();
  elsif (new.status <> 'mastered' and old.status = 'mastered') then
    new.mastered_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_learning_targets_mastered_at on public.learning_targets;
create trigger trg_learning_targets_mastered_at
before update on public.learning_targets
for each row execute procedure public.set_mastered_at_on_status_change();
