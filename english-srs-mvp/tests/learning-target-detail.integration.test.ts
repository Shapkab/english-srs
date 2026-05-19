import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as targetDetailGet } from '@/app/api/v1/learning-targets/[id]/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn('[tests] Skipping learning-target-detail tests — set Supabase env vars to run them.');
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signUpUser(admin: SupabaseClient): Promise<{ userId: string; accessToken: string }> {
  const password = `lt-detail-Pass!${suffix()}`;
  const email = `lt-detail-${suffix()}@example.com`;
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

function authedGet(id: string, token: string): Request {
  return new Request(`http://localhost/api/v1/learning-targets/${id}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}

suite('GET /api/v1/learning-targets/[id]', () => {
  let admin: SupabaseClient;
  let userIdA = '';
  let tokenA = '';
  let userIdB = '';
  let tokenB = '';
  let targetAId = '';
  let submissionAId = '';

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

    // Seed user A's primary target.
    const { data: t, error: tErr } = await admin
      .from('learning_targets')
      .insert({
        user_id: userIdA,
        canonical_key: `lt-detail-${suffix()}`,
        display_title: 'Past simple — irregular verbs',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'Use went, not goed.',
      })
      .select('id')
      .single();
    if (tErr || !t) throw tErr ?? new Error('seed target failed');
    targetAId = t.id as string;

    // Seed user A's submission (source for cards + evidence).
    const { data: sub } = await admin
      .from('submissions')
      .insert({ user_id: userIdA, source_type: 'text', original_text: `seed ${suffix()}` })
      .select('id')
      .single();
    submissionAId = sub!.id as string;

    // Two cards: one active, one suspended.
    const cardSeeds = [
      { type: 'correction' as const, status: 'active' as const, label: 'a' },
      { type: 'cloze' as const, status: 'suspended' as const, label: 's' },
    ];
    for (const seed of cardSeeds) {
      const { data: card } = await admin
        .from('cards')
        .insert({
          user_id: userIdA,
          learning_target_id: targetAId,
          source_submission_id: submissionAId,
          card_type: seed.type,
          front: `front-${seed.label}`,
          back: `back-${seed.label}`,
          status: seed.status,
        })
        .select('id')
        .single();
      await admin.from('srs_state').insert({
        card_id: card!.id,
        user_id: userIdA,
        repetition: 0,
        interval_days: 0,
        ease_factor: 2.5,
        due_at: new Date().toISOString(),
        lapse_count: 0,
      });
    }

    // Three evidence rows, each tied to a real analysis_issue (FK).
    for (let i = 0; i < 3; i++) {
      const { data: subN } = await admin
        .from('submissions')
        .insert({ user_id: userIdA, source_type: 'text', original_text: `ev-${i} ${suffix()}` })
        .select('id')
        .single();
      const { data: ana } = await admin
        .from('analyses')
        .insert({
          submission_id: subN!.id,
          user_id: userIdA,
          model: 'test',
          corrected_text: 'x',
          schema_version: 'test',
        })
        .select('id')
        .single();
      const { data: issue } = await admin
        .from('analysis_issues')
        .insert({
          analysis_id: ana!.id,
          submission_id: subN!.id,
          user_id: userIdA,
          error_text: `err-${i}-${suffix()}`,
          corrected_text: 'fix',
          category: 'grammar',
          explanation_short: 'x',
          confidence: 0.9,
          severity: 1,
          teachability: 1,
          should_create_card: false,
        })
        .select('id')
        .single();
      await admin.from('learning_target_evidence').insert({
        learning_target_id: targetAId,
        analysis_issue_id: issue!.id,
        submission_id: subN!.id,
        user_id: userIdA,
      });
      // Brief delay so created_at ordering is deterministic.
      await new Promise((r) => setTimeout(r, 10));
    }
  });

  afterAll(async () => {
    if (!admin) return;
    for (const uid of [userIdA, userIdB].filter(Boolean)) {
      try {
        await admin.from('learning_target_evidence').delete().eq('user_id', uid);
        await admin.from('analysis_issues').delete().eq('user_id', uid);
        await admin.from('analyses').delete().eq('user_id', uid);
        await admin.from('srs_state').delete().eq('user_id', uid);
        await admin.from('cards').delete().eq('user_id', uid);
        await admin.from('learning_targets').delete().eq('user_id', uid);
        await admin.from('submissions').delete().eq('user_id', uid);
        await admin.from('users_profile').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid);
      } catch {
        // best-effort
      }
    }
  });

  it('returns the target + active+suspended cards + 3 evidence rows', async () => {
    const res = await targetDetailGet(authedGet(targetAId, tokenA), {
      params: Promise.resolve({ id: targetAId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      target: {
        id: string;
        displayTitle: string;
        category: string;
        mergedIntoId: string | null;
      };
      cards: Array<{ status: string; cardId: string }>;
      evidence: Array<{ id: string; createdAt: string }>;
    };

    expect(body.target.id).toBe(targetAId);
    expect(body.target.displayTitle).toBe('Past simple — irregular verbs');
    expect(body.target.category).toBe('tense');
    expect(body.target.mergedIntoId).toBeNull();

    expect(body.cards).toHaveLength(2);
    const statuses = body.cards.map((c) => c.status).sort();
    expect(statuses).toEqual(['active', 'suspended']);

    expect(body.evidence).toHaveLength(3);
    // Newest-first ordering: each createdAt should be >= the next.
    const ts = body.evidence.map((e) => e.createdAt);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1] >= ts[i]).toBe(true);
    }
  });

  it('returns 404 not_found when user B requests user A\'s target', async () => {
    const res = await targetDetailGet(authedGet(targetAId, tokenB), {
      params: Promise.resolve({ id: targetAId }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('not_found');
  });

  it('returns 400 validation_error for non-UUID id', async () => {
    const res = await targetDetailGet(
      new Request('http://localhost/api/v1/learning-targets/not-a-uuid', {
        method: 'GET',
        headers: { authorization: `Bearer ${tokenA}` },
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation_error');
  });

  it('returns mergedIntoId set when the target has been merged into another', async () => {
    // Seed a second target for user A; merge A's primary target into it.
    const { data: into } = await admin
      .from('learning_targets')
      .insert({
        user_id: userIdA,
        canonical_key: `lt-detail-into-${suffix()}`,
        display_title: 'survivor',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'x',
      })
      .select('id')
      .single();
    const intoId = into!.id as string;

    // Seed a fresh merge-from target so we don't disturb the first test's
    // expectations on targetAId.
    const { data: from } = await admin
      .from('learning_targets')
      .insert({
        user_id: userIdA,
        canonical_key: `lt-detail-from-${suffix()}`,
        display_title: 'merge from',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'x',
      })
      .select('id')
      .single();
    const fromId = from!.id as string;

    const { error: mergeErr } = await admin.rpc('merge_learning_targets', {
      p_from_id: fromId,
      p_into_id: intoId,
      p_user_id: userIdA,
    });
    expect(mergeErr).toBeNull();

    const res = await targetDetailGet(authedGet(fromId, tokenA), {
      params: Promise.resolve({ id: fromId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { target: { mergedIntoId: string | null } };
    expect(body.target.mergedIntoId).toBe(intoId);
  });
});
