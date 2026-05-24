/* eslint-disable no-console */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { getSupabaseAdmin } from '@/lib/db/server';
import { processSubmission } from '@/lib/services/process-submission.service';
import type { Database } from '@/lib/types/database.generated';
import { log } from '@/lib/observability/log';

/** Time after which a "processing" job is considered abandoned and can be reclaimed.
 *  5 minutes balances recovery speed vs false positives on slow OpenAI calls. */
export const STALE_CLAIM_MS = 5 * 60 * 1000;
/** Idle sleep between poll cycles when no jobs are available.
 *  3s keeps latency low without hammering the DB. */
const POLL_IDLE_MS = 3000;
/** Ceiling for exponential backoff on retryable failures (1 minute). */
const MAX_BACKOFF_MS = 60_000;

interface PendingJobRow {
  id: string;
  type: string;
  payload: { submissionId: string; userId: string } | Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

interface RetryableErrorShape {
  status?: number;
  code?: string;
  message?: string;
}

export function classifyRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as RetryableErrorShape;

  // OpenAI SDK + most HTTP-client errors expose `status`.
  if (typeof e.status === 'number') {
    if (e.status === 429) return true;
    if (e.status >= 500 && e.status < 600) return true;
    // Any other HTTP status (4xx that isn't 429) is treated as terminal —
    // those are deterministic, retrying won't change the answer.
    return false;
  }

  // Network-layer errors from undici/fetch/node.
  if (typeof e.code === 'string') {
    if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED') {
      return true;
    }
  }

  // `fetch failed` is the generic node:fetch wrapper for network failures.
  if (typeof e.message === 'string' && /fetch failed/i.test(e.message)) {
    return true;
  }

  return false;
}

export async function recoverStaleClaims(
  supabase: SupabaseClient<Database>,
  staleAfterMs: number = STALE_CLAIM_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'pending', claimed_at: null })
    .eq('status', 'processing')
    .lt('claimed_at', cutoff)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function processOneJob(supabase: SupabaseClient<Database>): Promise<boolean> {
  const recovered = await recoverStaleClaims(supabase);
  if (recovered > 0) log.warn('worker_stale_claim_recovered', { count: recovered });

  const { data: nextJob, error: nextErr } = await supabase
    .from('jobs')
    .select('id, type, payload, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<PendingJobRow>();
  if (nextErr) throw nextErr;
  if (!nextJob) return false;

  if (nextJob.attempts >= nextJob.max_attempts) {
    const { error: failErr } = await supabase
      .from('jobs')
      .update({ status: 'failed', last_error: 'max_attempts_exceeded' })
      .eq('id', nextJob.id);
    if (failErr) throw failErr;

    // Propagate the failure to the submission (M5) — otherwise it stalls
    // in `pending` forever. Mirrors the terminal catch-branch below.
    const payload = nextJob.payload as { submissionId?: string; userId?: string };
    if (payload?.submissionId && payload?.userId) {
      const { error: markErr } = await supabase.rpc('mark_submission_failed', {
        p_submission_id: payload.submissionId,
        p_user_id: payload.userId,
        p_reason: 'max_attempts_exceeded',
      });
      if (markErr) console.error('[worker] mark_submission_failed error', markErr);
    }
    return true;
  }

  const { data: job, error: claimErr } = await supabase
    .from('jobs')
    .update({
      status: 'processing',
      attempts: nextJob.attempts + 1,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', nextJob.id)
    .eq('status', 'pending')
    .select('id, type, payload, attempts, max_attempts')
    .maybeSingle<PendingJobRow>();
  if (claimErr) throw claimErr;
  if (!job) return true;

  const startMs = Date.now();
  try {
    if (job.type !== 'analyze_submission') {
      throw new Error(`Unsupported job type: ${job.type}`);
    }
    const { submissionId, userId } = job.payload as { submissionId: string; userId: string };
    const result = await processSubmission({ submissionId, userId });
    const durationMs = Date.now() - startMs;
    console.log('[worker] completed job', {
      jobId: job.id,
      submissionId,
      durationMs,
      issueCount: result.issueCount,
      cardsCreated: result.createdCardIds.length,
    });

    const { error: doneErr } = await supabase
      .from('jobs')
      .update({ status: 'done', claimed_at: null })
      .eq('id', job.id);
    if (doneErr) throw doneErr;
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error('[worker] failed job', { jobId: job.id, durationMs, error });
    const isRetryable = classifyRetryable(error);
    const willRetry = isRetryable && job.attempts < job.max_attempts;
    const reason = error instanceof Error ? error.message : String(error);

    if (willRetry) {
      const backoffMs = Math.min(MAX_BACKOFF_MS, 2 ** job.attempts * 1_000);
      const { error: requeueErr } = await supabase
        .from('jobs')
        .update({
          status: 'pending',
          claimed_at: null,
          available_at: new Date(Date.now() + backoffMs).toISOString(),
          last_error: reason,
        })
        .eq('id', job.id);
      if (requeueErr) console.error('[worker] requeue update error', requeueErr);
    } else {
      const { error: failErr } = await supabase
        .from('jobs')
        .update({ status: 'failed', claimed_at: null, last_error: reason })
        .eq('id', job.id);
      if (failErr) console.error('[worker] failed-state update error', failErr);

      const payload = job.payload as { submissionId?: string; userId?: string };
      if (payload?.submissionId && payload?.userId) {
        const { error: markErr } = await supabase.rpc('mark_submission_failed', {
          p_submission_id: payload.submissionId,
          p_user_id: payload.userId,
          p_reason: reason,
        });
        if (markErr) console.error('[worker] mark_submission_failed error', markErr);
      }
    }
  }

  return true;
}

async function runForever() {
  console.log('[worker] started');
  const supabase = getSupabaseAdmin();
  for (;;) {
    try {
      const worked = await processOneJob(supabase);
      if (!worked) await new Promise((resolve) => setTimeout(resolve, POLL_IDLE_MS));
    } catch (error) {
      console.error('[worker] iteration error', error);
      await new Promise((resolve) => setTimeout(resolve, POLL_IDLE_MS));
    }
  }
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectRun) {
  // Mirror what `next dev` and tests/setup.ts do — tsx doesn't auto-load .env.local.
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // fall through to .env / real environment
  }
  try {
    process.loadEnvFile('.env');
  } catch {
    // both files optional
  }
  runForever().catch((error) => {
    console.error('[worker] fatal', error);
    process.exit(1);
  });
}
