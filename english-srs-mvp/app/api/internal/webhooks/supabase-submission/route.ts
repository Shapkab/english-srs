// Supabase Database Webhooks use pg_net with a short default timeout (~5 s),
// while a single submission analysis takes 5-30 s. A synchronous handler would
// have Supabase disconnect mid-processing. We acknowledge the webhook fast
// (HTTP 200) and run the analysis in a Vercel background task via Next.js's
// `after()` API, which keeps the function alive up to `maxDuration`.
import { NextResponse, after } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { getSupabaseAdmin } from '@/lib/db/server';
import { processSubmission } from '@/lib/services/process-submission.service';
import { classifyRetryable } from '@/workers/process-jobs';
import { log } from '@/lib/observability/log';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby ceiling
export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  type: z.literal('INSERT'),
  table: z.literal('submissions'),
  schema: z.literal('public'),
  record: z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    status: z.string().optional(),
  }),
});

function authorize(request: Request): { ok: true } | { ok: false; status: 401 | 500; body: { error: string } } {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) {
    log.error('webhook_secret_unset', {});
    return { ok: false, status: 500, body: { error: 'webhook_secret_unset' } };
  }
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }
  if (!timingSafeEqual(headerBuf, expectedBuf)) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const { record } = parsed;

  if (record.status && record.status !== 'pending') {
    log.debug('webhook_skipped_non_pending', {
      submissionId: record.id,
      status: record.status,
    });
    return NextResponse.json({ skipped: 'non_pending_status' });
  }

  after(async () => {
    const startedAt = Date.now();
    const admin = getSupabaseAdmin();
    try {
      const result = await processSubmission({
        submissionId: record.id,
        userId: record.user_id,
      });
      log.info('webhook_processed', {
        submissionId: record.id,
        durationMs: Date.now() - startedAt,
        issueCount: result.issueCount,
        cardsCreated: result.createdCardIds.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = classifyRetryable(err);
      log.error('webhook_processing_failed', {
        submissionId: record.id,
        durationMs: Date.now() - startedAt,
        retryable,
        message,
      });
      // Even retryable errors are NOT retried automatically — we already
      // returned 200 to Supabase. Mark terminal only.
      if (!retryable) {
        const { error: markErr } = await admin.rpc('mark_submission_failed', {
          p_submission_id: record.id,
          p_user_id: record.user_id,
          p_reason: message.slice(0, 500),
        });
        if (markErr) {
          log.error('mark_submission_failed_failed', {
            submissionId: record.id,
            message: markErr.message,
          });
        }
      }
    }
  });

  return NextResponse.json({ accepted: true });
}
