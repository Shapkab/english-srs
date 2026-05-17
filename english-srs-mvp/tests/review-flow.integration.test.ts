import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as reviewQueueGet } from '@/app/api/v1/review-queue/route';
import { POST as reviewsPost } from '@/app/api/v1/reviews/route';
import { POST as feedbackPost } from '@/app/api/v1/cards/[cardId]/feedback/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping review-flow tests — set NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to run them.',
  );
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface SeededCard {
  cardId: string;
  back: string;
}

suite('/review end-to-end flow (route handlers + DB)', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  let learningTargetId = '';
  const seededCardIds = new Set<string>();
  const pastDue = () => new Date(Date.now() - 60_000).toISOString();
  const password = 'review-Flow-Pass!23';
  const email = `review-flow-${suffix()}@example.com`;

  async function seedCard(opts: { back: string; status?: 'active' | 'suspended' }): Promise<SeededCard> {
    const { back, status = 'active' } = opts;
    const { data: cardRow, error: cardErr } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: learningTargetId,
        card_type: 'correction',
        front: `front-${suffix()}`,
        back,
        status,
      })
      .select('id')
      .single();
    if (cardErr || !cardRow) throw cardErr ?? new Error('seed card failed');

    const cardId = cardRow.id as string;
    seededCardIds.add(cardId);

    const { error: srsErr } = await admin.from('srs_state').insert({
      card_id: cardId,
      user_id: userId,
      repetition: 0,
      interval_days: 0,
      ease_factor: 2.5,
      due_at: pastDue(),
      lapse_count: 0,
    });
    if (srsErr) throw srsErr;

    return { cardId, back };
  }

  function authedGet(path: string) {
    return new Request(`http://localhost${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  function authedPost(path: string, body: unknown) {
    return new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

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

    const { data: lt, error: ltErr } = await admin
      .from('learning_targets')
      .insert({
        user_id: userId,
        canonical_key: `review-flow-${suffix()}`,
        display_title: 'review flow seed',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'Use past simple.',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');
    learningTargetId = lt.id;
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      for (const id of seededCardIds) {
        await admin.from('card_feedback').delete().eq('card_id', id);
        await admin.from('reviews').delete().eq('card_id', id);
        await admin.from('srs_state').delete().eq('card_id', id);
        await admin.from('cards').delete().eq('id', id);
      }
      if (learningTargetId) {
        await admin.from('learning_targets').delete().eq('id', learningTargetId);
      }
      if (userId) {
        await admin.from('users_profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    } catch {
      // best-effort
    }
  });

  it('queue exposes back for an active due card', async () => {
    const seeded = await seedCard({ back: `back-${suffix()}` });

    const res = await reviewQueueGet(authedGet('/api/v1/review-queue'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: Array<{ cardId: string; back: string }>;
    };
    const match = body.cards.find((c) => c.cardId === seeded.cardId);
    expect(match).toBeDefined();
    expect(match!.back).toBe(seeded.back);
  });

  it('rating advances SRS and returns a future nextDueAt', async () => {
    const seeded = await seedCard({ back: `back-${suffix()}` });

    const { data: before, error: beforeErr } = await admin
      .from('srs_state')
      .select('repetition')
      .eq('card_id', seeded.cardId)
      .single();
    expect(beforeErr).toBeNull();
    const initialRepetition = before!.repetition as number;

    const res = await reviewsPost(authedPost('/api/v1/reviews', { cardId: seeded.cardId, rating: 4 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; nextDueAt: string };
    expect(body.ok).toBe(true);
    expect(new Date(body.nextDueAt).getTime()).toBeGreaterThan(Date.now());

    const { data: after } = await admin
      .from('srs_state')
      .select('repetition')
      .eq('card_id', seeded.cardId)
      .single();
    expect((after!.repetition as number)).toBeGreaterThan(initialRepetition);
  });

  it('multi-card flow: rating the first removes it from the next queue', async () => {
    const a = await seedCard({ back: 'first' });
    const b = await seedCard({ back: 'second' });

    const beforeRes = await reviewQueueGet(authedGet('/api/v1/review-queue'));
    const beforeBody = (await beforeRes.json()) as { cards: Array<{ cardId: string }> };
    const beforeIds = new Set(beforeBody.cards.map((c) => c.cardId));
    expect(beforeIds.has(a.cardId)).toBe(true);
    expect(beforeIds.has(b.cardId)).toBe(true);

    const rateRes = await reviewsPost(authedPost('/api/v1/reviews', { cardId: a.cardId, rating: 4 }));
    expect(rateRes.status).toBe(200);

    const afterRes = await reviewQueueGet(authedGet('/api/v1/review-queue'));
    const afterBody = (await afterRes.json()) as { cards: Array<{ cardId: string }> };
    const afterIds = new Set(afterBody.cards.map((c) => c.cardId));
    expect(afterIds.has(a.cardId)).toBe(false);
    expect(afterIds.has(b.cardId)).toBe(true);
  });

  it('empty queue returns { cards: [] } for a user with no due cards', async () => {
    const { data: emptyUser, error: emptyUserErr } = await admin.auth.admin.createUser({
      email: `review-flow-empty-${suffix()}@example.com`,
      password: 'empty-User-Pass!23',
      email_confirm: true,
    });
    if (emptyUserErr || !emptyUser.user) throw emptyUserErr ?? new Error('empty user failed');

    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signin } = await anon.auth.signInWithPassword({
      email: emptyUser.user.email!,
      password: 'empty-User-Pass!23',
    });
    const emptyToken = signin!.session!.access_token;

    const req = new Request('http://localhost/api/v1/review-queue', {
      method: 'GET',
      headers: { authorization: `Bearer ${emptyToken}` },
    });
    const res = await reviewQueueGet(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[] };
    expect(body.cards).toEqual([]);

    try {
      await admin.from('users_profile').delete().eq('id', emptyUser.user.id);
      await admin.auth.admin.deleteUser(emptyUser.user.id);
    } catch {
      // best effort
    }
  });

  it('feedback type=duplicate suspends the card and removes it from the queue', async () => {
    const seeded = await seedCard({ back: 'duplicate-target' });

    const res = await feedbackPost(
      authedPost(`/api/v1/cards/${seeded.cardId}/feedback`, { type: 'duplicate', note: null }),
      { params: Promise.resolve({ cardId: seeded.cardId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const { data: row } = await admin
      .from('cards')
      .select('status')
      .eq('id', seeded.cardId)
      .single();
    expect(row!.status).toBe('suspended');

    const queueRes = await reviewQueueGet(authedGet('/api/v1/review-queue'));
    const queueBody = (await queueRes.json()) as { cards: Array<{ cardId: string }> };
    expect(queueBody.cards.find((c) => c.cardId === seeded.cardId)).toBeUndefined();
  });
});
