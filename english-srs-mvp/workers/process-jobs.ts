/* eslint-disable no-console */
import { getSupabaseAdmin } from '@/lib/db/server';
import { processSubmission } from '@/lib/services/process-submission.service';

async function processOneJob() {
  const supabase = getSupabaseAdmin();

  const { data: nextJob, error: nextJobError } = await supabase
    .from('jobs')
    .select('id, type, payload, attempts')
    .eq('status', 'pending')
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextJobError) throw nextJobError;

  if (!nextJob) return false;

  const { data: job, error: claimError } = await supabase
    .from('jobs')
    .update({ status: 'processing', attempts: nextJob.attempts + 1 })
    .eq('id', nextJob.id)
    .eq('status', 'pending')
    .select('id, type, payload, attempts')
    .maybeSingle();
  if (claimError) throw claimError;

  // Another worker claimed this job between select and update.
  if (!job) return true;

  try {
    if (job.type !== 'analyze_submission') {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    const { submissionId, userId } = job.payload as { submissionId: string; userId: string };
    await processSubmission({ submissionId, userId });

    const { error: doneError } = await supabase.from('jobs').update({ status: 'done' }).eq('id', job.id);
    if (doneError) throw doneError;
    return true;
  } catch (error) {
    console.error('[worker] failed job', job.id, error);
    const { error: failedError } = await supabase
      .from('jobs')
      .update({ status: 'failed', last_error: error instanceof Error ? error.message : 'Unknown error' })
      .eq('id', job.id);
    if (failedError) throw failedError;
    return true;
  }
}

async function main() {
  console.log('[worker] started');
  for (;;) {
    const worked = await processOneJob();
    if (!worked) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
