import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { POST as submissionsPost } from '@/app/api/v1/submissions/route';
import { GET as analysisGet } from '@/app/api/v1/submissions/[submissionId]/analysis/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping analysis-route-failed-state tests — set Supabase env vars to run them.',
  );
}

suite('GET /api/v1/submissions/[id]/analysis — terminal-failure shape (D2)', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  let submissionId: string | null = null;
  const submittedText = 'I goed to school yesterday, also yesterday I eated breakfast.';
  const failureReason = 'test_terminal_failure';
  const password = 'failed-State-Pass!23';
  const email = `failed-state-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

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

    const postReq = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: submittedText }),
    });
    const postRes = await submissionsPost(postReq);
    if (postRes.status !== 201) {
      throw new Error(`POST /submissions returned ${postRes.status}`);
    }
    const postJson = (await postRes.json()) as { submissionId: string };
    submissionId = postJson.submissionId;

    // Drive the submission into a terminal-failed state without running the
    // worker. mark_submission_failed is service-role-only by design.
    const { error: rpcErr } = await admin.rpc('mark_submission_failed', {
      p_submission_id: submissionId,
      p_user_id: userId,
      p_reason: failureReason,
    });
    if (rpcErr) throw rpcErr;
  });

  afterAll(async () => {
    if (!admin || !userId) return;
    try {
      if (submissionId) {
        await admin.from('jobs').delete().eq('payload->>submissionId', submissionId);
        await admin.from('submissions').delete().eq('id', submissionId);
      }
      await admin.from('users_profile').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // best effort
    }
  });

  it('returns the failed-state shape with failureReason, originalText, and empty issues/cards', async () => {
    if (!submissionId) throw new Error('submissionId not set by beforeAll');
    const req = new Request(`http://localhost/api/v1/submissions/${submissionId}/analysis`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const res = await analysisGet(req, {
      params: Promise.resolve({ submissionId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      failureReason: string | null;
      originalText: string;
      correctedText: string | null;
      issues: unknown[];
      cardsCreated: unknown[];
    };

    expect(body.status).toBe('failed');
    // failureReason is mapped to a user-safe string (L1) — the raw stored
    // reason must never reach the client.
    expect(body.failureReason).toBe('Analysis failed. Please try resubmitting.');
    expect(body.failureReason).not.toContain(failureReason);
    expect(body.originalText).toBe(submittedText);
    expect(body.correctedText).toBeNull();
    expect(body.issues).toEqual([]);
    expect(body.cardsCreated).toEqual([]);
  });
});
