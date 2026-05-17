import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { POST as reviewsPost } from '@/app/api/v1/reviews/route';
import { GET as reviewQueueGet } from '@/app/api/v1/review-queue/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn('[tests] Skipping record_review leech-suspend tests — set Supabase env vars to run them.');
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Fixtures {
  admin: SupabaseClient;
  userId: string;
  accessToken: string;
  learningTargetId: string;
  submissionId: string;
}

async function newFixtures(): Promise<Fixtures> {
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const password = `leech-Pass!${suffix()}`;
  const email = `leech-${suffix()}@example.com`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error('createUser failed');
  const userId = created.user.id;

  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
  if (signinErr || !signin.session) throw signinErr ?? new Error('signIn failed');
  const accessToken = signin.session.access_token;

  const { data: lt, error: ltErr } = await admin
    .from('learning_targets')
    .insert({
      user_id: userId,
      canonical_key: `leech-${suffix()}`,
      display_title: 'leech seed',
      category: 'tense',
      subcategory: 'past simple',
      explanation_short: 'leech.',
    })
    .select('id')
    .single();
  if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');

  const { data: sub, error: subErr } = await admin
    .from('submissions')
    .insert({ user_id: userId, source_type: 'text', original_text: `leech seed ${suffix()}` })
    .select('id')
    .single();
  if (subErr || !sub) throw subErr ?? new Error('seed submission failed');

  return {
    admin,
    userId,
    accessToken,
    learningTargetId: lt.id as string,
    submissionId: sub.id as string,
  };
}

async function seedCard(f: Fixtures, suffixLabel: string): Promise<string> {
  const { data: cardRow, error: cardErr } = await f.admin
    .from('cards')
    .insert({
      user_id: f.userId,
      learning_target_id: f.learningTargetId,
      source_submission_id: f.submissionId,
      card_type: suffixLabel === '8x' ? 'correction' : 'cloze',
      front: `leech-front-${suffixLabel}`,
      back: `leech-back-${suffixLabel}`,
      status: 'active',
    })
    .select('id')
    .single();
  if (cardErr || !cardRow) throw cardErr ?? new Error('seed card failed');

  const { error: srsErr } = await f.admin.from('srs_state').insert({
    card_id: cardRow.id,
    user_id: f.userId,
    repetition: 0,
    interval_days: 0,
    ease_factor: 2.5,
    due_at: new Date(Date.now() - 60_000).toISOString(),
    lapse_count: 0,
  });
  if (srsErr) throw srsErr;

  return cardRow.id as string;
}

async function teardown(f: Fixtures) {
  try {
    await f.admin.from('reviews').delete().eq('user_id', f.userId);
    await f.admin.from('srs_state').delete().eq('user_id', f.userId);
    await f.admin.from('cards').delete().eq('user_id', f.userId);
    await f.admin.from('submissions').delete().eq('user_id', f.userId);
    await f.admin.from('learning_targets').delete().eq('user_id', f.userId);
    await f.admin.from('users_profile').delete().eq('id', f.userId);
    await f.admin.auth.admin.deleteUser(f.userId);
  } catch {
    // best-effort
  }
}

suite('record_review leech-suspend at lapse_count >= 8', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await newFixtures();
  });

  afterAll(async () => {
    if (fixtures) await teardown(fixtures);
  });

  it('suspends a card and drops it from the queue after 8 consecutive lapses', async () => {
    const cardId = await seedCard(fixtures, '8x');

    for (let i = 0; i < 8; i++) {
      const req = new Request('http://localhost/api/v1/reviews', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${fixtures.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cardId, rating: 0 }),
      });
      const res = await reviewsPost(req);
      expect(res.status, `rating ${i + 1}/8 should succeed`).toBe(200);
    }

    const { data: srs } = await fixtures.admin
      .from('srs_state')
      .select('lapse_count')
      .eq('card_id', cardId)
      .single();
    expect(srs!.lapse_count).toBe(8);

    const { data: card } = await fixtures.admin
      .from('cards')
      .select('status')
      .eq('id', cardId)
      .single();
    expect(card!.status).toBe('suspended');

    const queueReq = new Request('http://localhost/api/v1/review-queue', {
      method: 'GET',
      headers: { authorization: `Bearer ${fixtures.accessToken}` },
    });
    const queueRes = await reviewQueueGet(queueReq);
    expect(queueRes.status).toBe(200);
    const queueBody = (await queueRes.json()) as { cards: Array<{ cardId: string }> };
    expect(queueBody.cards.find((c) => c.cardId === cardId)).toBeUndefined();
  }, 30_000);

  it('does NOT suspend a card after 7 consecutive lapses', async () => {
    const cardId = await seedCard(fixtures, '7x');

    for (let i = 0; i < 7; i++) {
      const req = new Request('http://localhost/api/v1/reviews', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${fixtures.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cardId, rating: 0 }),
      });
      const res = await reviewsPost(req);
      expect(res.status, `rating ${i + 1}/7 should succeed`).toBe(200);
    }

    const { data: srs } = await fixtures.admin
      .from('srs_state')
      .select('lapse_count')
      .eq('card_id', cardId)
      .single();
    expect(srs!.lapse_count).toBe(7);

    const { data: card } = await fixtures.admin
      .from('cards')
      .select('status')
      .eq('id', cardId)
      .single();
    expect(card!.status).toBe('active');
  }, 30_000);
});
