import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { processOneJob, recoverStaleClaims } from '@/workers/process-jobs';
import type { Database } from '@/lib/types/database.generated';

vi.mock('@/lib/services/process-submission.service', () => ({
  processSubmission: vi.fn(),
}));

// eslint-disable-next-line import/first
import { processSubmission } from '@/lib/services/process-submission.service';

const mockedProcessSubmission = processSubmission as unknown as ReturnType<typeof vi.fn>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping worker-claim tests — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + npx supabase start) to run them.',
  );
}

interface TestJobRow {
  id: string;
  status: string;
  claimed_at: string | null;
  available_at: string;
  last_error: string | null;
  attempts: number;
  max_attempts: number;
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('worker claim semantics', () => {
  let admin: SupabaseClient<Database>;
  const createdIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Clean any leftover pending/processing jobs so processOneJob picks the
    // job each test inserts. This is a local test DB; jobs is internal
    // worker infrastructure with no end-user data.
    await admin.from('jobs').delete().in('status', ['pending', 'processing']);
  });

  afterEach(async () => {
    mockedProcessSubmission.mockReset();
    if (createdIds.length === 0) return;
    await admin.from('jobs').delete().in('id', createdIds);
    createdIds.length = 0;
  });

  afterAll(async () => {
    if (admin && createdIds.length > 0) {
      await admin.from('jobs').delete().in('id', createdIds);
    }
  });

  it('stale-claim recovery: re-queues processing jobs whose claimed_at is older than the threshold', async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: inserted, error: insErr } = await admin
      .from('jobs')
      .insert({
        type: 'analyze_submission',
        payload: { submissionId: '00000000-0000-0000-0000-000000000001', userId: '00000000-0000-0000-0000-000000000002' },
        status: 'processing',
        attempts: 1,
        claimed_at: tenMinAgo,
      } as never)
      .select('id')
      .single();
    if (insErr || !inserted) throw insErr ?? new Error('insert stale job failed');
    createdIds.push(inserted.id);

    const recovered = await recoverStaleClaims(admin);
    expect(recovered).toBeGreaterThanOrEqual(1);

    const { data: row, error: rowErr } = await admin
      .from('jobs')
      .select('id, status, claimed_at, available_at, last_error, attempts, max_attempts')
      .eq('id', inserted.id)
      .single<TestJobRow>();
    expect(rowErr).toBeNull();
    expect(row!.status).toBe('pending');
    expect(row!.claimed_at).toBeNull();
  });

  it('max-attempts cap: marks pending job failed with last_error=max_attempts_exceeded', async () => {
    const { data: inserted, error: insErr } = await admin
      .from('jobs')
      .insert({
        type: 'analyze_submission',
        payload: { submissionId: '00000000-0000-0000-0000-000000000003', userId: '00000000-0000-0000-0000-000000000004' },
        status: 'pending',
        attempts: 3,
        max_attempts: 3,
      } as never)
      .select('id')
      .single();
    if (insErr || !inserted) throw insErr ?? new Error('insert capped job failed');
    createdIds.push(inserted.id);

    const worked = await processOneJob(admin);
    expect(worked).toBe(true);

    const { data: row, error: rowErr } = await admin
      .from('jobs')
      .select('id, status, claimed_at, available_at, last_error, attempts, max_attempts')
      .eq('id', inserted.id)
      .single<TestJobRow>();
    expect(rowErr).toBeNull();
    expect(row!.status).toBe('failed');
    expect(row!.last_error).toBe('max_attempts_exceeded');
  });
});

suite('worker retry-with-backoff and terminal failure (H2, H3)', () => {
  let admin: SupabaseClient<Database>;
  let userId: string;
  const createdJobIds: string[] = [];
  const createdSubmissionIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await admin.from('jobs').delete().in('status', ['pending', 'processing']);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `worker-retry-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (createErr || !created.user) throw createErr ?? new Error('createUser failed');
    userId = created.user.id;
  });

  afterEach(async () => {
    mockedProcessSubmission.mockReset();
    if (createdJobIds.length > 0) {
      await admin.from('jobs').delete().in('id', createdJobIds);
      createdJobIds.length = 0;
    }
    if (createdSubmissionIds.length > 0) {
      await admin.from('submissions').delete().in('id', createdSubmissionIds);
      createdSubmissionIds.length = 0;
    }
  });

  afterAll(async () => {
    if (!admin) return;
    if (userId) {
      try {
        await admin.from('users_profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best-effort
      }
    }
  });

  async function seedSubmissionAndJob(payloadOverride?: { submissionId?: string }) {
    const { data: sub, error: subErr } = await admin
      .from('submissions')
      .insert({
        user_id: userId,
        source_type: 'text',
        original_text: `worker-retry probe ${suffix()}`,
        status: 'pending',
      } as never)
      .select('id')
      .single();
    if (subErr || !sub) throw subErr ?? new Error('seed submission failed');
    const submissionId = payloadOverride?.submissionId ?? sub.id;
    createdSubmissionIds.push(sub.id);

    const { data: job, error: jobErr } = await admin
      .from('jobs')
      .insert({
        type: 'analyze_submission',
        payload: { submissionId, userId },
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
      } as never)
      .select('id')
      .single();
    if (jobErr || !job) throw jobErr ?? new Error('seed job failed');
    createdJobIds.push(job.id);

    return { submissionId: sub.id, jobId: job.id };
  }

  // Vitest runs test files in parallel and other files insert jobs into the
  // same local DB; processOneJob picks the oldest pending job, so other files'
  // jobs could be picked instead of ours. Isolate by deleting non-ours just
  // before invoking the worker.
  async function isolateAndProcess(jobId: string) {
    await admin
      .from('jobs')
      .delete()
      .neq('id', jobId)
      .in('status', ['pending', 'processing']);
    return processOneJob(admin);
  }

  it('retry-on-retryable: 500-class error requeues to pending with future available_at; succeeds on retry', async () => {
    const { jobId, submissionId } = await seedSubmissionAndJob();

    // First call throws a synthesized 500; second call succeeds.
    mockedProcessSubmission
      .mockImplementationOnce(async () => {
        const err = new Error('upstream 500') as Error & { status?: number };
        err.status = 500;
        throw err;
      })
      .mockImplementationOnce(async () => {
        // success path: worker only cares that no error was thrown.
      });

    const worked1 = await isolateAndProcess(jobId);
    expect(worked1).toBe(true);

    const { data: row1 } = await admin
      .from('jobs')
      .select('id, status, claimed_at, available_at, last_error, attempts, max_attempts')
      .eq('id', jobId)
      .single<TestJobRow>();
    expect(row1!.status).toBe('pending');
    expect(row1!.claimed_at).toBeNull();
    expect(row1!.last_error).toMatch(/upstream 500/);
    expect(Date.parse(row1!.available_at)).toBeGreaterThan(Date.now());
    expect(row1!.attempts).toBe(1);

    // The submission must still be 'pending' — we're going to retry, not fail.
    const { data: subRow1 } = await admin
      .from('submissions')
      .select('status, failure_reason')
      .eq('id', submissionId)
      .single<{ status: string; failure_reason: string | null }>();
    expect(subRow1!.status).toBe('pending');
    expect(subRow1!.failure_reason).toBeNull();

    // Simulate backoff elapsing: move available_at to the past, then process again.
    await admin
      .from('jobs')
      .update({ available_at: new Date(Date.now() - 1000).toISOString() } as never)
      .eq('id', jobId);

    const worked2 = await isolateAndProcess(jobId);
    expect(worked2).toBe(true);

    const { data: row2 } = await admin
      .from('jobs')
      .select('id, status, claimed_at, available_at, last_error, attempts, max_attempts')
      .eq('id', jobId)
      .single<TestJobRow>();
    expect(row2!.status).toBe('done');
    expect(row2!.claimed_at).toBeNull();
    expect(row2!.attempts).toBe(2);
  });

  it('terminal-on-non-retryable: zod-style error marks job failed AND flips submission to failed with failure_reason', async () => {
    const { jobId, submissionId } = await seedSubmissionAndJob();

    mockedProcessSubmission.mockImplementationOnce(async () => {
      throw new Error('zod validation failed');
    });

    const worked = await isolateAndProcess(jobId);
    expect(worked).toBe(true);

    const { data: jobRow } = await admin
      .from('jobs')
      .select('id, status, claimed_at, available_at, last_error, attempts, max_attempts')
      .eq('id', jobId)
      .single<TestJobRow>();
    expect(jobRow!.status).toBe('failed');
    expect(jobRow!.claimed_at).toBeNull();
    expect(jobRow!.last_error).toMatch(/zod validation failed/);

    const { data: subRow } = await admin
      .from('submissions')
      .select('status, failure_reason')
      .eq('id', submissionId)
      .single<{ status: string; failure_reason: string | null }>();
    expect(subRow!.status).toBe('failed');
    expect(subRow!.failure_reason).not.toBeNull();
    expect(subRow!.failure_reason).toMatch(/zod validation failed/);
  });
});
