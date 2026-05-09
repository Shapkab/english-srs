import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { updateSrsState } from '@/lib/srs/update-srs';

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

suite('record_review', () => {
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

  it('happy path: inserts review, advances srs_state, returns new due_at', async () => {
    const updated = updateSrsState(
      { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 },
      4,
    );

    const { data: nextDueAt, error } = await admin.rpc('record_review', {
      p_card_id: cardId,
      p_user_id: userId,
      p_rating: 4,
      p_response_ms: 1500,
      p_repetition: updated.repetition,
      p_interval_days: updated.intervalDays,
      p_ease_factor: updated.easeFactor,
      p_lapse_count: updated.lapseCount,
      p_due_at: updated.dueAt,
      p_last_reviewed_at: updated.lastReviewedAt,
    } as never);
    expect(error).toBeNull();
    expect(typeof nextDueAt === 'string' || nextDueAt instanceof Date).toBe(true);

    // Compare as ISO timestamps (Postgres may return ISO+microseconds; align via Date.parse).
    expect(Date.parse(String(nextDueAt))).toBe(Date.parse(updated.dueAt));

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
    expect(srsRow!.repetition).toBe(updated.repetition);
    expect(srsRow!.interval_days).toBe(updated.intervalDays);
    expect(Date.parse(String(srsRow!.due_at))).toBe(Date.parse(updated.dueAt));
  });

  it('ownership rejection: rpc errors when p_user_id does not own the srs_state row', async () => {
    const updated = updateSrsState(
      { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 },
      3,
    );

    const { error } = await admin.rpc('record_review', {
      p_card_id: cardId,
      p_user_id: otherUserId,
      p_rating: 3,
      p_response_ms: 500,
      p_repetition: updated.repetition,
      p_interval_days: updated.intervalDays,
      p_ease_factor: updated.easeFactor,
      p_lapse_count: updated.lapseCount,
      p_due_at: updated.dueAt,
      p_last_reviewed_at: updated.lastReviewedAt,
    } as never);
    expect(error).not.toBeNull();
    // `RAISE … USING errcode = 'no_data_found'` surfaces as the
    // plpgsql-specific code P0002 (the SQL standard `02000` no_data class
    // is what the spec referenced).
    expect(error?.code).toBe('P0002');
  });
});
