/* eslint-disable no-console */
import { getSupabaseAdmin } from '@/lib/db/server';
import { processSubmission } from '@/lib/services/process-submission.service';

async function processOneJob() {
  const supabase = getSupabaseAdmin();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, type, payload, attempts')
    .eq('status', 'pending')
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) return false;

  await supabase
    .from('jobs')
    .update({ status: 'processing', attempts: job.attempts + 1 })
    .eq('id', job.id);

  try {
    if (job.type !== 'analyze_submission') {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    const { submissionId, userId } = job.payload as { submissionId: string; userId: string };
    await processSubmission({ submissionId, userId });

    await supabase.from('jobs').update({ status: 'done' }).eq('id', job.id);
    return true;
  } catch (error) {
    console.error('[worker] failed job', job.id, error);
    await supabase
      .from('jobs')
      .update({ status: 'failed', last_error: error instanceof Error ? error.message : 'Unknown error' })
      .eq('id', job.id);
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
