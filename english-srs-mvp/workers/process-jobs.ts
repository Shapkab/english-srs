/* eslint-disable no-console */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { getSupabaseAdmin } from '@/lib/db/server';
import { processSubmission } from '@/lib/services/process-submission.service';
import type { Database } from '@/lib/types/database.generated';

export const STALE_CLAIM_MS = 5 * 60 * 1000;
const POLL_IDLE_MS = 3000;

interface PendingJobRow {
  id: string;
  type: string;
  payload: { submissionId: string; userId: string } | Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function recoverStaleClaims(
  supabase: SupabaseClient<Database>,
  staleAfterMs: number = STALE_CLAIM_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'pending', claimed_at: null } as never)
    .eq('status', 'processing')
    .lt('claimed_at', cutoff)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function processOneJob(supabase: SupabaseClient<Database>): Promise<boolean> {
  const recovered = await recoverStaleClaims(supabase);
  if (recovered > 0) console.log(`[worker] recovered ${recovered} stale jobs`);

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
    return true;
  }

  const { data: job, error: claimErr } = await supabase
    .from('jobs')
    .update({
      status: 'processing',
      attempts: nextJob.attempts + 1,
      claimed_at: new Date().toISOString(),
    } as never)
    .eq('id', nextJob.id)
    .eq('status', 'pending')
    .select('id, type, payload, attempts')
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!job) return true;

  try {
    if (job.type !== 'analyze_submission') {
      throw new Error(`Unsupported job type: ${job.type}`);
    }
    const { submissionId, userId } = job.payload as { submissionId: string; userId: string };
    await processSubmission({ submissionId, userId });

    const { error: doneErr } = await supabase
      .from('jobs')
      .update({ status: 'done', claimed_at: null } as never)
      .eq('id', job.id);
    if (doneErr) throw doneErr;
  } catch (error) {
    console.error('[worker] failed job', job.id, error);
    const { error: failErr } = await supabase
      .from('jobs')
      .update({
        status: 'failed',
        claimed_at: null,
        last_error: error instanceof Error ? error.message : 'Unknown error',
      } as never)
      .eq('id', job.id);
    if (failErr) console.error('[worker] failed-state update error', failErr);
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
  runForever().catch((error) => {
    console.error('[worker] fatal', error);
    process.exit(1);
  });
}
