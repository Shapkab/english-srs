import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as draftsGet, PUT as draftsPut, DELETE as draftsDelete } from '@/app/api/v1/drafts/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn('[tests] Skipping drafts tests — set Supabase env vars to run them.');
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signUpUser(admin: SupabaseClient): Promise<{ userId: string; accessToken: string }> {
  const password = `draft-Pass!${suffix()}`;
  const email = `draft-${suffix()}@example.com`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error('createUser failed');
  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
  if (signinErr || !signin.session) throw signinErr ?? new Error('signIn failed');
  return { userId: created.user.id, accessToken: signin.session.access_token };
}

function authed(method: string, body?: unknown, token?: string): Request {
  return new Request('http://localhost/api/v1/drafts', {
    method,
    headers: {
      authorization: `Bearer ${token ?? ''}`,
      'content-type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

suite('drafts CRUD', () => {
  let admin: SupabaseClient;
  let userIdA = '';
  let tokenA = '';
  let userIdB = '';
  let tokenB = '';

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await signUpUser(admin);
    userIdA = a.userId;
    tokenA = a.accessToken;
    const b = await signUpUser(admin);
    userIdB = b.userId;
    tokenB = b.accessToken;
  });

  afterAll(async () => {
    if (!admin) return;
    for (const uid of [userIdA, userIdB].filter(Boolean)) {
      try {
        await admin.from('drafts').delete().eq('user_id', uid);
        await admin.from('users_profile').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid);
      } catch {
        // best-effort
      }
    }
  });

  it('GET on a brand-new user returns draft: null', async () => {
    const res = await draftsGet(authed('GET', undefined, tokenA));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: unknown };
    expect(body.draft).toBeNull();
  });

  it('PUT then GET returns the saved content', async () => {
    const put = await draftsPut(authed('PUT', { content: 'hello world' }, tokenA));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true });

    const get = await draftsGet(authed('GET', undefined, tokenA));
    expect(get.status).toBe(200);
    const body = (await get.json()) as { draft: { content: string } };
    expect(body.draft.content).toBe('hello world');
  });

  it('PUT replaces the existing draft (upsert)', async () => {
    await draftsPut(authed('PUT', { content: 'first' }, tokenA));
    await draftsPut(authed('PUT', { content: 'second' }, tokenA));
    const get = await draftsGet(authed('GET', undefined, tokenA));
    const body = (await get.json()) as { draft: { content: string } };
    expect(body.draft.content).toBe('second');
  });

  it('DELETE removes the draft; GET returns null afterward', async () => {
    await draftsPut(authed('PUT', { content: 'doomed' }, tokenA));
    const del = await draftsDelete(authed('DELETE', undefined, tokenA));
    expect(del.status).toBe(200);
    const get = await draftsGet(authed('GET', undefined, tokenA));
    const body = (await get.json()) as { draft: unknown };
    expect(body.draft).toBeNull();
  });

  it('cross-user isolation: user B cannot see or delete user A\'s draft', async () => {
    await draftsPut(authed('PUT', { content: 'A only' }, tokenA));

    // B sees nothing.
    const bGet = await draftsGet(authed('GET', undefined, tokenB));
    expect((await bGet.json()).draft).toBeNull();

    // B's DELETE doesn't match any row under their RLS context.
    const bDel = await draftsDelete(authed('DELETE', undefined, tokenB));
    expect(bDel.status).toBe(200); // delete with no match is still 200

    // A's draft survives.
    const aGet = await draftsGet(authed('GET', undefined, tokenA));
    const aBody = (await aGet.json()) as { draft: { content: string } };
    expect(aBody.draft.content).toBe('A only');
  });

  it('PUT rejects empty string with validation_error', async () => {
    const res = await draftsPut(authed('PUT', { content: '' }, tokenA));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_error');
  });

  it('PUT rejects non-string content with validation_error', async () => {
    const res = await draftsPut(authed('PUT', { content: 42 }, tokenA));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_error');
  });
});
