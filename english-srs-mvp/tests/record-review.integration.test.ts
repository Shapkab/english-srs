import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping record_review tests — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + npx supabase start) to run them.',
  );
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('record_review (SM-2 in SQL, FOR UPDATE)', () => {
  let admin: SupabaseClient;
  let userId: string;
  let otherUserId: string;
  let cardId: string;

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: a, error: aErr } = await admin.auth.admin.createUser({
      email: `record-review-a-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (aErr || !a.user) throw aErr ?? new Error('createUser A failed');
    userId = a.user.id;

    const { data: b, error: bErr } = await admin.auth.admin.createUser({
      email: `record-review-b-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (bErr || !b.user) throw bErr ?? new Error('createUser B failed');
    otherUserId = b.user.id;

    const { data: lt, error: ltErr } = await admin
      .from('learning_targets')
      .insert({
        user_id: userId,
        canonical_key: `tense:past_simple:i went-${suffix()}`,
        display_title: 'I went',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'Use past simple.',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');

    const { data: card, error: cardErr } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: lt.id,
        card_type: 'correction',
        front: 'I ___ to school.',
        back: 'went',
      })
      .select('id')
      .single();
    if (cardErr || !card) throw cardErr ?? new Error('seed card failed');
    cardId = card.id;
  });

  beforeEach(async () => {
    // Reset srs_state to a known baseline between tests so each case starts
    // from repetition=0, interval=0, ease=2.5, lapse=0 and there are no
    // leftover reviews rows from the previous case.
    await admin.from('reviews').delete().eq('card_id', cardId);
    await admin.from('srs_state').delete().eq('card_id', cardId);
    const { error: srsErr } = await admin.from('srs_state').insert({
      card_id: cardId,
      user_id: userId,
      repetition: 0,
      interval_days: 0,
      ease_factor: 2.5,
      due_at: new Date().toISOString(),
      lapse_count: 0,
    });
    if (srsErr) throw srsErr;
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [userId, otherUserId].filter(Boolean)) {
      try {
        await admin.from('users_profile').delete().eq('id', id);
        await admin.auth.admin.deleteUser(id);
      } catch {
        // best-effort
      }
    }
  });

  it('happy path: inserts review, advances srs_state from rep=0 (first success → interval=1)', async () => {
    const { data: nextDueAt, error } = await admin.rpc('record_review', {
      p_card_id: cardId,
      p_user_id: userId,
      p_rating: 4,
      p_response_ms: 1500,
    } as never);
    expect(error).toBeNull();
    expect(typeof nextDueAt === 'string' || nextDueAt instanceof Date).toBe(true);

    const { data: reviewRows } = await admin
      .from('reviews')
      .select('id, rating, response_ms')
      .eq('card_id', cardId)
      .eq('user_id', userId);
    expect(reviewRows ?? []).toHaveLength(1);
    expect(reviewRows![0].rating).toBe(4);
    expect(reviewRows![0].response_ms).toBe(1500);

    const { data: srsRow } = await admin
      .from('srs_state')
      .select('repetition, interval_days, due_at')
      .eq('card_id', cardId)
      .single();
    expect(srsRow!.repetition).toBe(1);
    expect(srsRow!.interval_days).toBe(1);
    expect(Date.parse(String(srsRow!.due_at))).toBe(Date.parse(String(nextDueAt)));
  });

  it('ownership rejection: rpc errors when p_user_id does not own the srs_state row', async () => {
    const { error } = await admin.rpc('record_review', {
      p_card_id: cardId,
      p_user_id: otherUserId,
      p_rating: 3,
      p_response_ms: 500,
    } as never);
    expect(error).not.toBeNull();
    // `RAISE … USING errcode = '42501'` (insufficient_privilege) surfaces here
    // for the not-found case, matching the new SQL function body.
    expect(error?.code).toBe('42501');
  });

  it('concurrency: two parallel calls serialize under FOR UPDATE; no lost update', async () => {
    // Both calls bump the same srs_state row from rep=0. The FOR UPDATE row
    // lock makes them serial, so one final state lands with rep=2 and exactly
    // two reviews rows are inserted — no row is lost, no race over the
    // intermediate state.
    const [r1, r2] = await Promise.all([
      admin.rpc('record_review', {
        p_card_id: cardId,
        p_user_id: userId,
        p_rating: 4,
        p_response_ms: 100,
      } as never),
      admin.rpc('record_review', {
        p_card_id: cardId,
        p_user_id: userId,
        p_rating: 4,
        p_response_ms: 200,
      } as never),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();

    const { data: reviewRows } = await admin
      .from('reviews')
      .select('id')
      .eq('card_id', cardId)
      .eq('user_id', userId);
    expect(reviewRows ?? []).toHaveLength(2);

    const { data: srsRow } = await admin
      .from('srs_state')
      .select('repetition')
      .eq('card_id', cardId)
      .single();
    expect(srsRow!.repetition).toBe(2);
  });
});
