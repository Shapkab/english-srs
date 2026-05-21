# English SRS MVP

A minimal AI + SRS project skeleton built with Next.js, TypeScript, Supabase, and OpenAI.

## What this project is

This MVP is designed around a **learning target** model, not a naive `text -> correction -> flashcards` flow.

Pipeline:

```text
Submission
→ AI Analysis
→ Issue Normalization
→ Learning Target Upsert
→ Card Candidate Generation
→ Card Selection
→ Review Queue
→ Review Feedback
→ Mastery Update
```

## Included

- Next.js app router skeleton
- API endpoints for submissions, analysis, review queue, reviews, and card feedback
- Zod schemas for request/response validation
- OpenAI structured output prompts and service layer
- Supabase SQL schema and RLS-friendly table layout
- SRS update logic (SM-2 style)
- Worker scaffold for async analysis
- Normalization layer scaffold for converting issues into learning targets

## Not included yet

- Authentication UI
- Voice input
- Chat tutor mode
- Admin dashboard
- Native mobile client

## Quick start

1. Copy `.env.example` to `.env.local` and fill in the keys (see **Environment variables** below).
2. Install dependencies and bring the local Supabase stack up:

```bash
npm install
npx supabase start
npx supabase db reset --local
npm run dev
```

The entire schema lives in `supabase/migrations/20260510000000_init.sql`. Future schema changes go in new `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` files; each migration must be plain SQL (no `\i` includes) and idempotent (`if not exists` / `create or replace` / `drop ... if exists`).

## Environment variables

`.env.example` is the source of truth. Each key:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase project credentials (point at the local stack or a hosted project).
- `OPENAI_API_KEY` — required by the worker; analysis and card-generation calls fail without it.
- `OPENAI_MODEL_ANALYSIS`, `OPENAI_MODEL_CARD_GENERATION` — optional model overrides (default `gpt-4.1-mini`).
- `DEV_USER_ID` — dev-only bypass for bearer auth; set to a valid UUID. The auth helper auto-seeds the matching `users_profile` row so the first submission doesn't trip the FK.
- `ENABLE_DEV_AUTH` — required (`=1`) to activate the `DEV_USER_ID`
  bypass. Belt-and-suspenders against accidental production exposure
  when `NODE_ENV` defaults to `development` on non-Vercel hosts.

## RLS posture

Row-Level Security is **enabled and forced** on every user-scoped table (and `jobs` is locked down to the service role). Routes use the user-scoped Supabase client and rely on `auth.uid()` policies; the worker uses the service-role key to bypass RLS for cross-user infrastructure tasks. Direct `psql` reads against a tenant's tables without `auth.uid()` set will return zero rows even as the table owner — that's intentional, not a bug.

## Deployment (Vercel)

The app is deployed on Vercel. Because the Next.js app lives in the
`english-srs-mvp/` subdirectory of the repo, the Vercel project's
**Root Directory must be set to `english-srs-mvp`** — otherwise every
build fails. `vercel.json` pins the framework preset; everything else is
Next.js zero-config.

- **Environment variables** are configured in Vercel project settings
  (Production + Preview scopes), not committed. They must point at a
  **hosted** Supabase project — the local stack (`127.0.0.1`) is not
  reachable from Vercel. See **Environment variables** above for the
  list. Do **not** set `ENABLE_DEV_AUTH` in Vercel: `NODE_ENV` is
  `production` there, so real auth is always used.
- **Previews:** every branch / PR gets its own preview URL; `main`
  deploys to production.
- **Worker caveat:** the async analysis worker (`npm run worker:dev`,
  `workers/process-jobs.ts`) is a long-running poller and is **not** run
  by Vercel (serverless only). On a Vercel-only deploy, submissions are
  created and queued but never analyzed until the worker runs somewhere
  with access to the same hosted Supabase.

## Suggested build order

### Phase 1
- Create submission
- Analyze text via worker
- Store analysis and issues
- Upsert learning targets
- Generate max 1-2 cards

### Phase 2
- Review queue
- Review submission
- Update SRS state
- Track user feedback

### Phase 3
- Repeated weakness aggregation
- Better dedupe
- Batch backfills
- Voice/chat ingestion

## Key architectural point

The main product object is:

```text
LearningTarget
```

Not:

```text
Correction
```

That is the main design decision this repository protects.


## Local worker run

In one terminal:

```bash
npm run dev
```

In another terminal:

```bash
npm run worker:dev
```

For local API development without Supabase Auth tokens, set `DEV_USER_ID` in `.env.local`.

If you want to process a submission manually:

```bash
curl -X POST http://localhost:3000/api/dev/process-submission/<submissionId> \
  -H "Authorization: Bearer <supabase-access-token>"
```

## Worker operations

- **Throughput ceiling.** `workers/process-jobs.ts` claims **one** job per
  poll cycle and each job is two-or-more serial OpenAI calls (~5–30 s).
  Realistic ceiling is a few jobs/min per worker process.
- **Horizontal scaling.** Run more worker processes. Job claiming is an
  optimistic guarded update (`status = 'pending'` precondition), so multiple
  workers can run concurrently without claiming the same job twice.
- **Dead-letter recovery.** Permanently failed jobs (`status = 'failed'`)
  are surfaced by the `jobs_dead_letter` view — the human-recovery surface
  for inspecting `last_error` and deciding whether to requeue or discard.
  Like `jobs`, it is service-role / admin only.
