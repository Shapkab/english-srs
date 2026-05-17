import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const envReady = Boolean(url && serviceKey && anonKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping cards composite FK tests — set NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to run them.',
  );
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('cards (learning_target_id, user_id) composite FK', () => {
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let learningTargetOfAId = '';

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: a, error: aErr } = await admin.auth.admin.createUser({
      email: `cards-lt-fk-a-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (aErr || !a.user) throw aErr ?? new Error('createUser A failed');
    userAId = a.user.id;

    const { data: b, error: bErr } = await admin.auth.admin.createUser({
      email: `cards-lt-fk-b-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (bErr || !b.user) throw bErr ?? new Error('createUser B failed');
    userBId = b.user.id;

    const { data: lt, error: ltErr } = await admin
      .from('learning_targets')
      .insert({
        user_id: userAId,
        canonical_key: `cards-lt-fk-${suffix()}`,
        display_title: 'seed for A',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'Use past simple.',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');
    learningTargetOfAId = lt.id;
  });

  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.from('cards').delete().eq('learning_target_id', learningTargetOfAId);
      if (learningTargetOfAId) {
        await admin.from('learning_targets').delete().eq('id', learningTargetOfAId);
      }
      for (const id of [userAId, userBId].filter(Boolean)) {
        await admin.from('users_profile').delete().eq('id', id);
        await admin.auth.admin.deleteUser(id);
      }
    } catch {
      // best-effort
    }
  });

  it("rejects a card insert where user_id (B) does not match learning_target.user_id (A)", async () => {
    const { data, error } = await admin
      .from('cards')
      .insert({
        user_id: userBId,
        learning_target_id: learningTargetOfAId,
        card_type: 'correction',
        front: 'attempted cross-user card',
        back: 'rejected',
      })
      .select('id');

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // PostgreSQL FK violation
    expect(error!.code).toBe('23503');

    const { data: rows } = await admin
      .from('cards')
      .select('id')
      .eq('user_id', userBId)
      .eq('learning_target_id', learningTargetOfAId);
    expect(rows ?? []).toHaveLength(0);
  });
});
