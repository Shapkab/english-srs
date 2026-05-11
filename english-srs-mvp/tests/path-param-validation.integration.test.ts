import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { POST as feedbackPost } from '@/app/api/v1/cards/[cardId]/feedback/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping path-param-validation tests — set NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to run them.',
  );
}

suite('path-param UUID validation', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  const password = 'probe-Pass!23';
  const email = `path-param-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw createErr ?? new Error('createUser failed');
    userId = created.user.id;

    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
    if (signinErr || !signin.session) throw signinErr ?? new Error('signInWithPassword failed');
    accessToken = signin.session.access_token;
  });

  afterAll(async () => {
    if (admin && userId) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best-effort
      }
    }
  });

  it('returns 400 validation_error when cardId is not a UUID', async () => {
    const request = new Request('http://localhost/api/v1/cards/not-a-uuid/feedback', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'not_useful' }),
    });

    const response = await feedbackPost(request, {
      params: Promise.resolve({ cardId: 'not-a-uuid' }),
    });
    expect(response.status).toBe(400);

    const json = (await response.json()) as { code: string; issues: unknown[] };
    expect(json.code).toBe('validation_error');
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
  });
});
