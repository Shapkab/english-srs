import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as analysisGet } from '@/app/api/v1/submissions/[submissionId]/analysis/route';

// B4: assert that user A, authenticated with A's bearer token, cannot read
// user B's submission via the real HTTP route. RLS + the route's explicit
// `.eq('user_id', userId)` filter together must produce a 404 or an empty
// shape — and crucially must NEVER leak B's `original_text` or any other
// row field belonging to B.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping RLS cross-tenant tests — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + npx supabase start) to run them.',
  );
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('RLS cross-tenant isolation (real HTTP route)', () => {
  let admin: SupabaseClient;
  let userAId = '';
  let userBId = '';
  let userAToken = '';
  const userAPassword = 'probe-Pass!23';
  const userBPassword = 'probe-Pass!23';
  const userAEmail = `rls-a-${suffix()}@example.com`;
  const userBEmail = `rls-b-${suffix()}@example.com`;
  const userBOriginalText = `B's private text, must not leak — ${suffix()}.`;
  let userBSubmissionId = '';

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: createdA, error: createAErr } = await admin.auth.admin.createUser({
      email: userAEmail,
      password: userAPassword,
      email_confirm: true,
    });
    if (createAErr || !createdA.user) throw createAErr ?? new Error('createUser A failed');
    userAId = createdA.user.id;

    const { data: createdB, error: createBErr } = await admin.auth.admin.createUser({
      email: userBEmail,
      password: userBPassword,
      email_confirm: true,
    });
    if (createBErr || !createdB.user) throw createBErr ?? new Error('createUser B failed');
    userBId = createdB.user.id;

    // Sign in as A on a separate client to obtain a real access token.
    const aClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInErr } = await aClient.auth.signInWithPassword({
      email: userAEmail,
      password: userAPassword,
    });
    if (signInErr || !signIn.session) throw signInErr ?? new Error('signIn A failed');
    userAToken = signIn.session.access_token;

    // Seed a submission owned by B via the admin client.
    const { data: submission, error: subErr } = await admin
      .from('submissions')
      .insert({ user_id: userBId, source_type: 'text', original_text: userBOriginalText })
      .select('id')
      .single();
    if (subErr || !submission) throw subErr ?? new Error('seed B submission failed');
    userBSubmissionId = submission.id;
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [userAId, userBId].filter(Boolean)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("user A cannot read user B's submission via the analysis route", async () => {
    const request = new Request(
      `http://localhost/api/v1/submissions/${userBSubmissionId}/analysis`,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${userAToken}` },
      },
    );

    const response = await analysisGet(request, {
      params: Promise.resolve({ submissionId: userBSubmissionId }),
    });

    // Either: 404 (route's HttpError when the row isn't visible under A's RLS)
    // OR a body with no leaked fields. Both are acceptable security outcomes;
    // a body containing B's text is NOT.
    const status = response.status;
    expect([404, 200, 401, 403]).toContain(status);

    // Whatever the status, the body must not contain B's original_text.
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      bodyText = '';
    }
    expect(bodyText).not.toContain(userBOriginalText);

    // And it must not contain B's submission row's user_id, which would also
    // be a leak (lets A enumerate B's existence).
    expect(bodyText).not.toContain(userBId);
  });
});
