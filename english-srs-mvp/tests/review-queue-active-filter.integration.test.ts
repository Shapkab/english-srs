import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as reviewQueueGet } from '@/app/api/v1/review-queue/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping review-queue active-filter tests — set NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to run them.',
  );
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('GET /api/v1/review-queue cards.status=active filter (H5)', () => {
  let admin: SupabaseClient;
  let userId: string;
  let accessToken: string;
  let learningTargetId = '';
  let activeCardId = '';
  let suspendedCardId = '';

  const password = 'probe-Pass!23';
  const email = `review-queue-${suffix()}@example.com`;

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
        canonical_key: `tense:past_simple:queue-${suffix()}`,
        display_title: 'queue seed',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'Use past simple.',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');
    learningTargetId = lt.id;

    const sharedDueAt = new Date(Date.now() - 60_000).toISOString();

    // Seed a real submission per card so the unique index on
    // (user_id, learning_target_id, source_submission_id, card_type) with
    // NULLS NOT DISTINCT does not collide on two NULL source_submission_id
    // rows under the same target/type.
    async function seedSubmission(label: string): Promise<string> {
      const { data, error } = await admin
        .from('submissions')
        .insert({ user_id: userId, source_type: 'text', original_text: `seed ${label} ${suffix()}` })
        .select('id')
        .single();
      if (error || !data) throw error ?? new Error('seed submission failed');
      return data.id as string;
    }

    const activeSubmissionId = await seedSubmission('active');
    const suspendedSubmissionId = await seedSubmission('suspended');

    const { data: cardActive, error: cardActiveErr } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: learningTargetId,
        source_submission_id: activeSubmissionId,
        card_type: 'correction',
        front: 'active card front',
        back: 'went',
        status: 'active',
      })
      .select('id')
      .single();
    if (cardActiveErr || !cardActive) throw cardActiveErr ?? new Error('seed active card failed');
    activeCardId = cardActive.id;

    const { data: cardSuspended, error: cardSuspendedErr } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: learningTargetId,
        source_submission_id: suspendedSubmissionId,
        card_type: 'correction',
        front: 'suspended card front',
        back: 'went',
        status: 'suspended',
      })
      .select('id')
      .single();
    if (cardSuspendedErr || !cardSuspended) {
      throw cardSuspendedErr ?? new Error('seed suspended card failed');
    }
    suspendedCardId = cardSuspended.id;

    const { error: srsErr } = await admin.from('srs_state').insert([
      {
        card_id: activeCardId,
        user_id: userId,
        repetition: 0,
        interval_days: 0,
        ease_factor: 2.5,
        due_at: sharedDueAt,
        lapse_count: 0,
      },
      {
        card_id: suspendedCardId,
        user_id: userId,
        repetition: 0,
        interval_days: 0,
        ease_factor: 2.5,
        due_at: sharedDueAt,
        lapse_count: 0,
      },
    ]);
    if (srsErr) throw srsErr;
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      for (const id of [activeCardId, suspendedCardId].filter(Boolean)) {
        await admin.from('srs_state').delete().eq('card_id', id);
        await admin.from('cards').delete().eq('id', id);
      }
      if (learningTargetId) {
        await admin.from('learning_targets').delete().eq('id', learningTargetId);
      }
      if (userId) {
        await admin.from('submissions').delete().eq('user_id', userId);
        await admin.from('users_profile').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    } catch {
      // best-effort
    }
  });

  it('returns only active cards (suspended cards are filtered at the SQL layer)', async () => {
    const req = new Request('http://localhost/api/v1/review-queue', {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = await reviewQueueGet(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      cards: Array<{ cardId: string; back: string }>;
    };
    const returnedIds = new Set(body.cards.map((c) => c.cardId));
    expect(returnedIds.has(activeCardId)).toBe(true);
    expect(returnedIds.has(suspendedCardId)).toBe(false);

    const returnedActive = body.cards.find((c) => c.cardId === activeCardId);
    expect(returnedActive?.back).toBe('went');
  });

  it('orders same-due cards by priority desc as a secondary sort', async () => {
    // Seed two same-due cards under fresh learning_targets so each gets a
    // distinct (learning_target_id, source_submission_id) tuple and the
    // NULLS-NOT-DISTINCT unique index does not collide.
    const sharedDueAt = new Date(Date.now() - 120_000).toISOString();

    const { data: ltLow } = await admin
      .from('learning_targets')
      .insert({
        user_id: userId,
        canonical_key: `priority-lo-${suffix()}`,
        display_title: 'priority low seed',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'lo',
      })
      .select('id')
      .single();
    const { data: ltHigh } = await admin
      .from('learning_targets')
      .insert({
        user_id: userId,
        canonical_key: `priority-hi-${suffix()}`,
        display_title: 'priority high seed',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'hi',
      })
      .select('id')
      .single();
    const { data: subLo } = await admin
      .from('submissions')
      .insert({ user_id: userId, source_type: 'text', original_text: `prio-lo ${suffix()}` })
      .select('id')
      .single();
    const { data: subHi } = await admin
      .from('submissions')
      .insert({ user_id: userId, source_type: 'text', original_text: `prio-hi ${suffix()}` })
      .select('id')
      .single();

    const { data: cardLow } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: ltLow!.id,
        source_submission_id: subLo!.id,
        card_type: 'correction',
        front: 'low pri',
        back: 'lo',
        status: 'active',
        priority: 10,
      })
      .select('id')
      .single();
    const { data: cardHigh } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: ltHigh!.id,
        source_submission_id: subHi!.id,
        card_type: 'correction',
        front: 'high pri',
        back: 'hi',
        status: 'active',
        priority: 90,
      })
      .select('id')
      .single();
    await admin.from('srs_state').insert([
      {
        card_id: cardLow!.id,
        user_id: userId,
        repetition: 0,
        interval_days: 0,
        ease_factor: 2.5,
        due_at: sharedDueAt,
        lapse_count: 0,
      },
      {
        card_id: cardHigh!.id,
        user_id: userId,
        repetition: 0,
        interval_days: 0,
        ease_factor: 2.5,
        due_at: sharedDueAt,
        lapse_count: 0,
      },
    ]);

    const req = new Request('http://localhost/api/v1/review-queue', {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const res = await reviewQueueGet(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: Array<{ cardId: string }> };
    const hi = body.cards.findIndex((c) => c.cardId === cardHigh!.id);
    const lo = body.cards.findIndex((c) => c.cardId === cardLow!.id);
    expect(hi).toBeGreaterThanOrEqual(0);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(lo);

    // Cleanup the two extra cards + state + targets + submissions.
    await admin.from('srs_state').delete().in('card_id', [cardLow!.id, cardHigh!.id]);
    await admin.from('cards').delete().in('id', [cardLow!.id, cardHigh!.id]);
    await admin.from('learning_targets').delete().in('id', [ltLow!.id, ltHigh!.id]);
    await admin.from('submissions').delete().in('id', [subLo!.id, subHi!.id]);
  });
});
