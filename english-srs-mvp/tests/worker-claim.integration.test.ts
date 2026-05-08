import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { processOneJob, recoverStaleClaims } from '@/workers/process-jobs';
import type { Database } from '@/lib/types/database.generated';

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
  last_error: string | null;
  attempts: number;
  max_attempts: number;
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
        // claimed_at lives in the post-007 schema but isn't in database.generated.ts
        // (regen deferred per task brief); the `as never` below silences the gap.
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
      .select('id, status, claimed_at, last_error, attempts, max_attempts')
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
        // max_attempts lives in the post-007 schema but isn't in database.generated.ts
        // (regen deferred per task brief); the `as never` below silences the gap.
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
      .select('id, status, claimed_at, last_error, attempts, max_attempts')
      .eq('id', inserted.id)
      .single<TestJobRow>();
    expect(rowErr).toBeNull();
    expect(row!.status).toBe('failed');
    expect(row!.last_error).toBe('max_attempts_exceeded');
  });
});
