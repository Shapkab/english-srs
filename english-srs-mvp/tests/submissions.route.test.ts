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
    '[tests] Skipping POST /api/v1/submissions integration tests — set ' +
      'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and ' +
      'SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + npx supabase start) ' +
      'to run them.',
  );
}

suite('POST /api/v1/submissions', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  const password = 'probe-Pass!23';
  const email = `submissions-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

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
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best effort — don't fail the suite on cleanup
      }
    }
  });

  it('returns 201 and inserts an analyze_submission row in jobs', async () => {
    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'I goed to school yesterday.' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = (await response.json()) as { submissionId: string; status: string };
    expect(json.submissionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const { data: jobs, error: jobsError } = await admin
      .from('jobs')
      .select('id, type, status, payload')
      .eq('payload->>submissionId', json.submissionId);

    expect(jobsError).toBeNull();
    expect(jobs ?? []).toHaveLength(1);
    expect(jobs![0].type).toBe('analyze_submission');
    expect(jobs![0].status).toBe('pending');

    if (jobs?.[0]?.id) {
      await admin.from('jobs').delete().eq('id', jobs[0].id);
    }
    await admin.from('submissions').delete().eq('id', json.submissionId);
  });

  it('returns 401 with { code: "unauthorized" } when no Authorization header is sent', async () => {
    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'I goed to school yesterday.' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const json = (await response.json()) as Record<string, unknown>;
    expect(json).toEqual({ code: 'unauthorized' });
  });
});
