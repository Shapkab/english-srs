# Runbook

Operational guide for the failure classes the team has actually
seen or expects to see. Each entry: **symptoms**, **diagnosis**,
**remediation**. Run all SQL as the service-role user (Supabase
Studio → SQL editor while signed in as the project owner).

---

## 1. A submission is stuck in `pending`

### Symptoms
- User sees the "Analyzing…" spinner indefinitely after submitting
  text.
- The submission row exists in `public.submissions` but
  `status = 'pending'` and `analyses` has no matching row.

### Diagnosis

```sql
-- 1. Confirm the submission row and its status.
select id, user_id, status, failure_reason, created_at
  from public.submissions
 where id = '<submissionId>';

-- 2. On production (webhook path) there is no jobs row — the
--    webhook fires directly. Check the Vercel function logs for
--    the webhook handler:
--      /api/internal/webhooks/supabase-submission
--    filter by submissionId; look for `webhook_processed` (success)
--    or `webhook_processing_failed` (background error).

-- 3. Local / fallback worker path: a jobs row exists.
select id, type, status, attempts, max_attempts, last_error,
       claimed_at, available_at, payload->>'submissionId' as sub_id
  from public.jobs
 where payload->>'submissionId' = '<submissionId>'
 order by created_at desc;
```

Common causes:
- **Webhook never fired** (production): the Supabase webhook is
  disabled or its URL is wrong. Check Supabase → Database →
  Webhooks → `process_submission_on_insert`. Confirm it shows
  "Enabled" and the URL matches the deployed app.
- **Webhook fired but returned 401**: the bearer secret is out of
  sync between Vercel (`SUPABASE_WEBHOOK_SECRET` env var) and
  Supabase (the `Authorization` header value). Rotate to a fresh
  secret in both places.
- **Worker not running** (local): start `npm run worker:dev` in
  the app directory.
- **OpenAI quota / outage:** see §4.

### Remediation
- Production: re-trigger by manually firing the webhook from
  Supabase → Database → Webhooks → "Send a test event", or insert
  a new submission.
- Local: bring the worker up. The polling claim will pick up the
  pending row within ~3 s.
- Permanent failure: see §2.

---

## 2. The worker keeps failing the same job

### Symptoms
- A submission cycles between `processing` and `failed`, or stays
  `failed` permanently.
- The submission row's `failure_reason` is populated.

### Diagnosis

```sql
-- The dead-letter view exposes only failed jobs.
select id, type, attempts, max_attempts, last_error,
       payload->>'submissionId' as sub_id,
       updated_at
  from public.jobs_dead_letter
 order by updated_at desc
 limit 20;

-- Read the last error verbatim:
select last_error from public.jobs where id = '<jobId>';
```

Interpret `last_error`:
- `5xx` / `fetch failed` / `ETIMEDOUT` → OpenAI hiccup (was
  retryable but exhausted `max_attempts`).
- Zod validation error → schema drift; the prompt may have been
  changed without bumping the schema. See
  [`docs/CONVENTIONS.md`](CONVENTIONS.md) §3.
- `42501` / `not owned by user` → defensive ownership check in an
  RPC failed; data integrity issue.

### Remediation

**Requeue the job** (after fixing the root cause):

```sql
update public.jobs
   set status = 'pending',
       claimed_at = null,
       attempts = 0,
       last_error = null,
       available_at = now()
 where id = '<jobId>';
```

The worker will pick it up on the next poll cycle. Note the
`persist_submission_analysis` RPC is idempotent (early-returns if
an `analyses` row already exists), so a partial-success requeue is
safe.

**Discard the job** (if it should not be retried — bad input,
deleted user, etc.):

```sql
-- Leave the jobs row for audit; just mark the submission failed
-- so the UI stops polling.
select public.mark_submission_failed(
  '<submissionId>'::uuid,
  '<userId>'::uuid,
  'Manually discarded — see runbook §2'
);
```

---

## 3. Rate-limit RPC errors / users hitting 429

### Symptoms
- Client receives 429 with body
  `{"code":"rate_limited","message":"...","resetAt":"..."}` and
  the `X-RateLimit-*` / `Retry-After` headers.
- Affects only the `/api/v1/submissions` POST path.

### Diagnosis

Active buckets and their limits (defined in
[`app/api/v1/submissions/route.ts:10-13`](../app/api/v1/submissions/route.ts)):

| Bucket | Limit | Window |
|---|---|---|
| `ai_daily` | 100 | 86400 s (rolling 24 h) |
| `submissions` | 30 | 3600 s (rolling 1 h) |

The daily bucket is checked first — if it denies, no hourly token
is consumed.

```sql
-- Inspect a user's current bucket state.
select bucket, count, window_start
  from public.rate_limits
 where user_id = '<userId>'
   and bucket in ('ai_daily', 'submissions')
 order by bucket;
```

### Remediation

**Manually clear a bucket** (e.g., support waiver):

```sql
delete from public.rate_limits
 where user_id = '<userId>'
   and bucket = 'submissions';
```

The next request rebuilds the bucket from scratch.

**Raise a limit globally:** edit the constants in
`app/api/v1/submissions/route.ts` and redeploy. Both values are
top-of-file constants (`RATE_LIMIT_SUBMISSIONS_PER_HOUR`,
`RATE_LIMIT_SUBMISSIONS_PER_DAY`).

---

## 4. OpenAI degraded / outage

### Symptoms
- Many submissions in `pending` simultaneously across users.
- `[worker] failed job` logs with `status: 5xx` or `fetch failed`.
- Or background webhook logs: `webhook_processing_failed` with
  retryable errors.

### Impact
- New submissions queue but don't complete. The user-facing UX is
  an "Analyzing…" spinner.
- Workers retry up to `max_attempts` (default 3, exponential
  backoff capped at 60 s), then dead-letter.
- On the webhook path, retryable errors are treated as terminal
  (the route already returned 200 to Supabase). The submission
  ends up `pending` indefinitely; manual remediation needed once
  OpenAI recovers (see §1 remediation).

### Remediation
- **Short-term: do nothing.** Both paths recover automatically
  when OpenAI comes back. Workers backoff prevents thrashing.
- **Consider pausing the local worker** to avoid burning
  `max_attempts` on every queued job during a long outage. After
  recovery, requeue dead-lettered jobs via §2.
- **For the webhook path**, after OpenAI recovers, re-trigger
  stuck submissions by manually firing the webhook (Supabase →
  Database → Webhooks → "Send a test event") with each stuck
  submission's payload, or by inserting a fresh submission with
  the same text.
- **Monitor** by tailing Vercel function logs for
  `ai_call_failed` (the `lib/services/*.service.ts` error log
  shape).

---

## 5. `users_profile` / `auth.users` out of sync

### Symptoms
- A signed-in user with a valid Supabase Auth row gets foreign-key
  errors when creating a submission ("violates foreign key
  constraint" referencing `users_profile`).
- Or: a user appears in `auth.users` but not in `users_profile`.

### Background

A trigger (in
[`supabase/migrations/20260512100100_users_profile_seed_trigger.sql`](../supabase/migrations/20260512100100_users_profile_seed_trigger.sql))
auto-seeds a `users_profile` row when `auth.users` gets an insert.
Drift typically happens only when the trigger was disabled, the
profile was manually deleted, or a user was created via a path
that bypasses the trigger.

### Diagnosis

```sql
-- Find auth.users entries without a matching users_profile.
select u.id, u.email, u.created_at
  from auth.users u
  left join public.users_profile p on p.id = u.id
 where p.id is null;
```

### Remediation

```sql
-- Manually seed a missing profile.
insert into public.users_profile (id, email)
select u.id,
       coalesce(u.email, 'noemail+' || u.id || '@placeholder.local')
  from auth.users u
 where u.id = '<userId>'
on conflict (id) do nothing;
```

Verify the trigger still exists:

```sql
select tgname, tgenabled
  from pg_trigger
 where tgname = 'on_auth_user_created';
```

`tgenabled = 'O'` (origin) is enabled. Anything else means the
trigger was disabled and should be re-enabled with:

```sql
alter table auth.users enable trigger on_auth_user_created;
```
