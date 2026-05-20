import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { updateSrsState, type SrsStateInput } from '@/lib/srs/update-srs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  console.warn('[tests] Skipping SM-2 equivalence tests — set Supabase env vars to run them.');
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('SM-2 TypeScript/SQL equivalence', () => {
  let admin: SupabaseClient;
  let userId: string;
  let cardId: string;

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: user, error: userErr } = await admin.auth.admin.createUser({
      email: `srs-equiv-${suffix()}@example.com`,
      password: 'testPass!23',
      email_confirm: true,
    });
    if (userErr || !user.user) throw userErr ?? new Error('createUser failed');
    userId = user.user.id;

    const { data: lt, error: ltErr } = await admin
      .from('learning_targets')
      .insert({
        user_id: userId,
        canonical_key: `test:srs:${suffix()}`,
        display_title: 'Test Target',
        category: 'grammar',
        explanation_short: 'Test',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('create learning_target failed');

    const { data: card, error: cardErr } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        learning_target_id: lt.id,
        card_type: 'correction',
        front: 'Test front',
        back: 'Test back',
      })
      .select('id')
      .single();
    if (cardErr || !card) throw cardErr ?? new Error('create card failed');
    cardId = card.id;

    await admin.from('srs_state').insert({
      card_id: cardId,
      user_id: userId,
      repetition: 0,
      interval_days: 0,
      ease_factor: 2.5,
      lapse_count: 0,
      due_at: new Date().toISOString(),
    });
  }, 30_000);

  afterAll(async () => {
    if (!admin || !userId) return;
    try {
      await admin.from('users_profile').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort cleanup
    }
  }, 30_000);

  const testCases: Array<{ state: SrsStateInput; rating: number; description: string }> = [
    { state: { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 }, rating: 1, description: 'new card, fail' },
    { state: { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 }, rating: 3, description: 'new card, hard' },
    { state: { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 }, rating: 4, description: 'new card, good' },
    { state: { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 }, rating: 5, description: 'new card, easy' },
    { state: { repetition: 1, intervalDays: 1, easeFactor: 2.5, lapseCount: 0 }, rating: 4, description: 'rep 1, good' },
    { state: { repetition: 2, intervalDays: 3, easeFactor: 2.5, lapseCount: 0 }, rating: 4, description: 'rep 2, good' },
    { state: { repetition: 3, intervalDays: 8, easeFactor: 2.6, lapseCount: 0 }, rating: 1, description: 'established card, lapse' },
    { state: { repetition: 5, intervalDays: 21, easeFactor: 2.3, lapseCount: 2 }, rating: 5, description: 'mature card, easy' },
  ];

  for (const tc of testCases) {
    it(`TS and SQL produce same results: ${tc.description}`, async () => {
      await admin
        .from('srs_state')
        .update({
          repetition: tc.state.repetition,
          interval_days: tc.state.intervalDays,
          ease_factor: tc.state.easeFactor,
          lapse_count: tc.state.lapseCount,
          due_at: new Date().toISOString(),
        })
        .eq('card_id', cardId);

      const tsResult = updateSrsState(tc.state, tc.rating);

      await admin.rpc('record_review', {
        p_card_id: cardId,
        p_user_id: userId,
        p_rating: tc.rating,
        p_response_ms: 1000,
      });

      const { data: sqlState } = await admin
        .from('srs_state')
        .select('repetition, interval_days, ease_factor, lapse_count')
        .eq('card_id', cardId)
        .single();

      expect(tsResult.repetition).toBe(sqlState!.repetition);
      expect(tsResult.intervalDays).toBe(sqlState!.interval_days);
      expect(tsResult.easeFactor).toBeCloseTo(Number(sqlState!.ease_factor), 10);
      expect(tsResult.lapseCount).toBe(sqlState!.lapse_count);
    });
  }
});
