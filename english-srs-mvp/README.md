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

1. Copy `.env.example` to `.env.local`
2. Fill in Supabase and OpenAI keys
3. Run DB migration in Supabase
4. Install dependencies

```bash
npm install
npm run dev
```

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
