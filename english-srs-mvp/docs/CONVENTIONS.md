# Conventions

How to add the three most common change-types to this codebase
without surprising your reviewer. Each section names a canonical
example (file:line) you can read alongside.

---

## 1. Adding a new API route

**Canonical example:**
[`app/api/v1/submissions/route.ts`](../app/api/v1/submissions/route.ts)

Every public API route follows the same skeleton. Copy that file
and adapt; do not invent new patterns.

### Required ingredients

1. **Resolve the user context.** Start every handler with:
   ```ts
   const { userId, supabase } = await requireUserContext(request);
   ```
   `requireUserContext` (`lib/auth/user.ts`) verifies the bearer
   token via Supabase Auth and returns a user-scoped Supabase
   client. A missing or invalid token throws and the route returns
   401 via the structured-error path (see step 4).

2. **Validate inputs with Zod.** Path params:
   ```ts
   const id = uuidParam.parse(rawId);
   ```
   Bodies:
   ```ts
   const body = createSubmissionSchema.parse(await request.json());
   ```
   Schemas live in [`lib/validators/`](../lib/validators/). Add new
   schemas there; do not inline.

3. **Pick the right Supabase client.**
   - **Default:** the **user-scoped client** returned by
     `requireUserContext`. RLS policies are enforced; every row this
     client sees belongs to the calling user.
   - **`getSupabaseAdmin()` only when you genuinely need
     service-role access** — typically: writing to `jobs`, calling
     `SECURITY DEFINER` RPCs that are revoked from `authenticated`,
     or rate-limit bookkeeping. The T2 ESLint rule
     (`no-restricted-imports`) blocks `getSupabaseAdmin` outside an
     allowlist of routes/services/workers. If you have a new
     legitimate use, **add the file to the override list in
     `.eslintrc.json`** in the same PR — do not silence the rule
     inline.

4. **Use the structured-error helper for failures.** All routes
   wrap their body in a single `try` and end with:
   ```ts
   } catch (error) {
     return toErrorResponse(error, request);
   }
   ```
   `toErrorResponse` (`lib/http/errors.ts`) produces a typed JSON
   error body, sets the response status, and attaches the
   `X-Request-Id` header used by the structured logger.

5. **Request-id propagation.** Every route gets a request ID via
   `withRequestId(request).requestId`. Pass it to `log.info`,
   `log.warn`, `log.error` so server logs correlate to the
   client-visible header. The successful-response helper
   (`jsonWithRequestId`, `lib/observability/log.ts`) sets the
   `X-Request-Id` header automatically.

6. **Rate limiting.** Write paths that hit OpenAI **must** pre-check
   `check_and_consume_rate_limit` for both the per-hour and per-day
   buckets. See [`app/api/v1/submissions/route.ts`](../app/api/v1/submissions/route.ts)
   for the exact 429-response shape (includes `X-RateLimit-*` and
   `Retry-After` headers).

7. **Tests.** Every route gets a route test under
   [`tests/`](../tests/). Use the existing `tests/submissions.route.test.ts`
   as the unit-style template (mocks the DB layer) and
   `tests/persist-submission-analysis.integration.test.ts` for the
   integration style (talks to a local Supabase).

---

## 2. Adding a new migration

**Canonical example:** any file under
[`supabase/migrations/`](../supabase/migrations/) — e.g.
[`20260521100100_hot_path_indexes.sql`](../supabase/migrations/20260521100100_hot_path_indexes.sql)
for a small, single-purpose change.

### Hard rules

1. **Name:** `<YYYYMMDDHHMMSS>_<snake_case_subject>.sql`. The
   timestamp determines apply order — pick a value strictly greater
   than the latest existing file. Never reuse a timestamp.

2. **Never edit an existing migration file.** If a constraint or
   function is wrong, write a new migration that fixes it (with
   `create or replace`, `alter table`, `drop ... if exists`).
   Editing in place silently desyncs the dev DB from production.

3. **Idempotent.** Every statement must be safe to re-run:
   - `create table if not exists`
   - `create index if not exists`
   - `alter table ... add column if not exists`
   - `create or replace function ...`
   - `drop ... if exists` before recreating types/enums
   The local stack reapplies the full history on every
   `npx supabase db reset --local`; non-idempotent statements break
   that loop.

4. **Plain SQL only — no `\i` includes.** The Supabase CLI applies
   each file as a single transaction; psql meta-commands are not
   evaluated.

5. **`SECURITY DEFINER` functions:** every one must end with
   `set search_path = public, pg_temp` and have execute permissions
   `revoke`d from `public`, `authenticated`, and `anon` (the latter
   two are auto-granted by default — read
   [`20260511120000_revoke_rpc_grants_from_authenticated.sql`](../supabase/migrations/20260511120000_revoke_rpc_grants_from_authenticated.sql)
   before adding a new one).

6. **Re-run [`scripts/verify-prod-constraints.sql`](../scripts/verify-prod-constraints.sql)**
   before any migration that introduces a unique or composite
   constraint. It flags rows that would violate the new constraint
   so you can fix the data first.

### After applying the migration

1. Apply locally: `npx supabase db reset --local`.
2. Regenerate types: `npm run db:types` (uses the local stack).
   For a hosted project: `npx supabase link --project-ref <ref>`
   then `npm run db:types:remote`. The pre-commit hook (T8) blocks
   committing a migration without a regenerated
   `lib/types/database.generated.ts`.
3. Run `npm run typecheck` to surface any type drift the new
   schema caused.
4. If the migration adds or changes a table the worker reads,
   update affected tests in [`tests/`](../tests/) — at minimum
   `persist-submission-analysis.integration.test.ts` if the change
   touches `submissions` / `analyses` / `analysis_issues` /
   `cards` / `srs_state`.

---

## 3. Adding or changing an AI prompt

**Canonical example:**
[`lib/openai/prompts.ts`](../lib/openai/prompts.ts) for the prompt
strings,
[`lib/openai/schemas.ts`](../lib/openai/schemas.ts) for the JSON
schemas the model must return,
[`lib/openai/schema-version.ts`](../lib/openai/schema-version.ts)
for the version fingerprint.

### Files involved

1. **`lib/openai/prompts.ts`** — system and user prompts. User
   text is wrapped between two identical unguessable delimiters
   built from `crypto.randomUUID()` so injection in the data
   payload cannot escape into instructions. A meta-instruction in
   each system prompt restates this rule for the model.

2. **`lib/openai/schemas.ts`** — the strict JSON schemas the
   OpenAI Responses API enforces (`additionalProperties: false`,
   enum-constrained category fields). Adding a field here is what
   actually changes the contract; changing a prompt's wording is
   usually free, but adding a new output field must come with a
   schema update.

3. **`lib/openai/schema-version.ts`** — derives
   `ANALYSIS_SCHEMA_VERSION` and `CARD_GEN_SCHEMA_VERSION` by
   hashing the system prompt + schema. The hash is stored on
   `analyses.schema_version` per row so a future migration can
   identify pre-change rows.

### Rules

1. **Any change to a system prompt auto-bumps the schema-version
   hash.** That is intentional — do not pin or short-circuit the
   hash. Old rows keep their old version; new rows record the new
   one.

2. **Field additions must be backward-compatible.** The route that
   reads `analyses` rows is read by users of all historical
   versions; never *remove* a field from the schema without a
   data-migration story.

3. **Server-side Zod re-validation is mandatory.** Even with
   strict JSON-schema output, the route re-parses with the Zod
   schema in [`lib/validators/api.ts`](../lib/validators/api.ts)
   before storing. Add the matching Zod entry whenever you change
   the JSON schema.

4. **Add an eval fixture.** *(Flag for human: the eval harness
   does not yet exist as of this writing — see REVIEW.md M4 / §6
   item 10. When it lands, every prompt change should ship with at
   least one new fixture covering the new behavior.)*

### Testing a prompt change locally

There is no live-prompt-replay test in the repo today. The closest
thing is `tests/persist-submission-analysis.integration.test.ts`,
which exercises the post-LLM persistence path with a hand-crafted
fixture payload. Use it to catch schema-shape regressions; the
actual model output quality is human-judged on real submissions
until the eval harness lands.
