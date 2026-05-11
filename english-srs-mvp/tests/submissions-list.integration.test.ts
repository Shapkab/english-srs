import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as submissionsGet, POST as submissionsPost } from '@/app/api/v1/submissions/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping submissions-list tests — set NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to run them.',
  );
}

interface SubmissionRow {
  id: string;
  status: string;
  original_text: string;
  created_at: string;
}

suite('GET /api/v1/submissions', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  const password = 'probe-Pass!23';
  const email = `submissions-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const insertedIds: string[] = [];

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
    if (signinErr || !signin.session) throw signinErr ?? new Error('signIn failed');
    accessToken = signin.session.access_token;

    // Seed two submissions via the POST route so the data is created in the
    // same path the user-facing flow uses.
    for (const text of ['first submission text', 'second submission text']) {
      const req = new Request('http://localhost/api/v1/submissions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      const res = await submissionsPost(req);
      expect(res.status).toBe(201);
      const json = (await res.json()) as { submissionId: string };
      insertedIds.push(json.submissionId);
      // Tiny stagger so created_at differs between the two
      await new Promise((r) => setTimeout(r, 25));
    }
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      for (const id of insertedIds) {
        await admin.from('jobs').delete().filter('payload->>submissionId', 'eq', id);
        await admin.from('submissions').delete().eq('id', id);
      }
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort
    }
  });

  it('returns the authenticated user\'s submissions, newest first', async () => {
    const req = new Request('http://localhost/api/v1/submissions', {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = await submissionsGet(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { submissions: SubmissionRow[] };
    expect(Array.isArray(body.submissions)).toBe(true);
    expect(body.submissions.length).toBeGreaterThanOrEqual(2);

    // All belong to this user (RLS filter)
    const { data: ownRows } = await admin
      .from('submissions')
      .select('id')
      .eq('user_id', userId);
    const ownIds = new Set((ownRows ?? []).map((r) => r.id));
    for (const row of body.submissions) {
      expect(ownIds.has(row.id)).toBe(true);
    }

    // Newest first: created_at strictly non-increasing
    for (let i = 1; i < body.submissions.length; i += 1) {
      expect(
        Date.parse(body.submissions[i - 1].created_at),
      ).toBeGreaterThanOrEqual(Date.parse(body.submissions[i].created_at));
    }
  });

  it('returns 401 unauthorized when no Authorization header is sent', async () => {
    const req = new Request('http://localhost/api/v1/submissions', { method: 'GET' });
    const res = await submissionsGet(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('unauthorized');
  });
});

// This suite passes under RLS alone (production bearer-token auth scopes
// auth.uid() correctly), so the explicit `.eq('user_id', userId)` filter in
// the handler is defense-in-depth — it keeps the endpoint correct when
// requireUserContext returns the admin client (Phase B R-015 dev bypass).
// The test is documentation; the filter is the load-bearing change.
suite('GET /api/v1/submissions cross-tenant isolation (D-1)', () => {
  let admin: SupabaseClient;
  let userAId = '';
  let userBId = '';
  let userATokenAccess = '';
  let userBTokenAccess = '';
  let submissionAId = '';
  let submissionBId = '';

  const password = 'probe-Pass!23';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailA = `submissions-list-A-${suffix}@example.com`;
  const emailB = `submissions-list-B-${suffix}@example.com`;

  async function createUserAndToken(email: string): Promise<{ id: string; accessToken: string }> {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw createErr ?? new Error(`createUser ${email} failed`);

    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
    if (signinErr || !signin.session) throw signinErr ?? new Error(`signIn ${email} failed`);

    return { id: created.user.id, accessToken: signin.session.access_token };
  }

  async function postSubmissionAs(accessToken: string, text: string): Promise<string> {
    const req = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    const res = await submissionsPost(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { submissionId: string };
    return json.submissionId;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const a = await createUserAndToken(emailA);
    userAId = a.id;
    userATokenAccess = a.accessToken;

    const b = await createUserAndToken(emailB);
    userBId = b.id;
    userBTokenAccess = b.accessToken;

    submissionAId = await postSubmissionAs(userATokenAccess, 'user A text');
    submissionBId = await postSubmissionAs(userBTokenAccess, 'user B text');
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      for (const id of [submissionAId, submissionBId].filter(Boolean)) {
        await admin.from('jobs').delete().filter('payload->>submissionId', 'eq', id);
        await admin.from('submissions').delete().eq('id', id);
      }
      for (const uid of [userAId, userBId].filter(Boolean)) {
        await admin.auth.admin.deleteUser(uid);
      }
    } catch {
      // best-effort
    }
  });

  it('A\'s GET returns only A\'s submissions; B\'s row never appears', async () => {
    const req = new Request('http://localhost/api/v1/submissions', {
      method: 'GET',
      headers: { authorization: `Bearer ${userATokenAccess}` },
    });
    const res = await submissionsGet(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { submissions: SubmissionRow[] };
    expect(body.submissions.length).toBe(1);
    expect(body.submissions[0].id).toBe(submissionAId);
    expect(body.submissions.some((row) => row.id === submissionBId)).toBe(false);
  });

  it('B\'s GET returns only B\'s submissions; A\'s row never appears', async () => {
    const req = new Request('http://localhost/api/v1/submissions', {
      method: 'GET',
      headers: { authorization: `Bearer ${userBTokenAccess}` },
    });
    const res = await submissionsGet(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { submissions: SubmissionRow[] };
    expect(body.submissions.length).toBe(1);
    expect(body.submissions[0].id).toBe(submissionBId);
    expect(body.submissions.some((row) => row.id === submissionAId)).toBe(false);
  });
});
