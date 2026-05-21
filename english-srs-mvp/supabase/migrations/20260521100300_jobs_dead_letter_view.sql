-- Dead-letter view for permanently failed jobs (M3, MVP scope).
-- Human-recovery surface for jobs that exhausted retries. Service-role /
-- admin only, matching the access posture of the jobs table itself.

create or replace view public.jobs_dead_letter as
  select id, type, payload, attempts, max_attempts, last_error,
         created_at, updated_at
    from public.jobs
   where status = 'failed';

revoke all on public.jobs_dead_letter from anon, authenticated;
