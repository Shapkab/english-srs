import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { POST } from '@/app/api/v1/submissions/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping rate-limit integration tests — set ' +
      'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and ' +
      'SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + npx supabase start) ' +
      'to run them.',
  );
}

suite('POST /api/v1/submissions rate-limit (Panel H1)', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  const password = 'rate-Limit-Pass!23';
  const email = `rate-limit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  async function postSubmission(): Promise<Response> {
    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'I goed to the park yesterday.' }),
    });
    return POST(request);
  }

  async function cleanupSubmissionsAndJobs() {
    const { data: subs } = await admin
      .from('submissions')
      .select('id')
      .eq('user_id', userId);
    const ids = (subs ?? []).map((row) => row.id as string);
    if (ids.length > 0) {
      await admin.from('jobs').delete().in('payload->>submissionId', ids);
      await admin.from('submissions').delete().in('id', ids);
    }
    await admin.from('rate_limits').delete().eq('user_id', userId);
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw createError ?? new Error('auth.admin.createUser returned no user');
    }
    userId = created.user.id;

    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signin, error: signinError } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    if (signinError || !signin.session) {
      throw signinError ?? new Error('signInWithPassword returned no session');
    }
    accessToken = signin.session.access_token;
  });

  afterAll(async () => {
    if (admin && userId) {
      try {
        await cleanupSubmissionsAndJobs();
      } catch {
        // best effort
      }
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best effort
      }
    }
  });

  it('returns 429 { code: "rate_limited" } on the 31st submission within the window', async () => {
    for (let i = 0; i < 30; i++) {
      const response = await postSubmission();
      expect(response.status, `submission ${i + 1} should succeed`).toBe(201);
    }

    const blocked = await postSubmission();
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as { code: string };
    expect(json.code).toBe('rate_limited');

    await cleanupSubmissionsAndJobs();
  }, 60_000);

  it('allows a new submission after the window resets', async () => {
    for (let i = 0; i < 30; i++) {
      const response = await postSubmission();
      expect(response.status, `pre-reset submission ${i + 1} should succeed`).toBe(201);
    }
    const blocked = await postSubmission();
    expect(blocked.status).toBe(429);

    const { error: updateErr } = await admin
      .from('rate_limits')
      .update({ window_started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() })
      .eq('user_id', userId)
      .eq('bucket', 'submissions');
    expect(updateErr).toBeNull();

    const afterReset = await postSubmission();
    expect(afterReset.status).toBe(201);

    await cleanupSubmissionsAndJobs();
  }, 60_000);
});
