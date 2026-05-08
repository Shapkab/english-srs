-- jobs.claimed_at + jobs.max_attempts (R-003).
-- Foundation for stale-claim recovery and bounded retries in the worker.

alter table jobs add column if not exists claimed_at timestamptz;
alter table jobs add column if not exists max_attempts integer not null default 3;

create index if not exists idx_jobs_processing_claimed_at
  on jobs (status, claimed_at)
  where status = 'processing';
