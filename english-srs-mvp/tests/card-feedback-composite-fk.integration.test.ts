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
    '[tests] Skipping card_feedback composite FK tests — set NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + ' +
      'npx supabase start) to run them.',
  );
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('card_feedback composite FK (H4)', () => {
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let userBJwt: string;
  let learningTargetId: string | null = null;
  let cardOfAId: string;

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const passwordA = 'probe-Pass!23';
    const passwordB = 'probe-Pass!23';

    const { data: a, error: aErr } = await admin.auth.admin.createUser({
      email: `cf-fk-a-${suffix()}@example.com`,
      password: passwordA,
      email_confirm: true,
    });
    if (aErr || !a.user) throw aErr ?? new Error('createUser A failed');
    userAId = a.user.id;

    const { data: b, error: bErr } = await admin.auth.admin.createUser({
      email: `cf-fk-b-${suffix()}@example.com`,
      password: passwordB,
      email_confirm: true,
    });
    if (bErr || !b.user) throw bErr ?? new Error('createUser B failed');
    userBId = b.user.id;

    // Sign B in to get a user-scoped JWT for the user-scoped client probe.
    const signInClient = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInErr } = await signInClient.auth.signInWithPassword({
      email: b.user.email!,
      password: passwordB,
    });
    if (signInErr || !signIn.session) throw signInErr ?? new Error('sign-in B failed');
    userBJwt = signIn.session.access_token;

    const { data: lt, error: ltErr } = await admin
      .from('learning_targets')
      .insert({
        user_id: userAId,
        canonical_key: `tense:past_simple:cf-fk-${suffix()}`,
        display_title: 'cf-fk seed',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'Use past simple.',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');
    learningTargetId = lt.id;

    const { data: card, error: cardErr } = await admin
      .from('cards')
      .insert({
        user_id: userAId,
        learning_target_id: learningTargetId,
        card_type: 'correction',
        front: 'I ___ to school.',
        back: 'went',
      })
      .select('id')
      .single();
    if (cardErr || !card) throw cardErr ?? new Error('seed card failed');
    cardOfAId = card.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (cardOfAId) {
      await admin.from('card_feedback').delete().eq('card_id', cardOfAId);
      await admin.from('cards').delete().eq('id', cardOfAId);
    }
    if (learningTargetId) {
      await admin.from('learning_targets').delete().eq('id', learningTargetId);
    }
    for (const id of [userAId, userBId].filter(Boolean)) {
      try {
        await admin.from('users_profile').delete().eq('id', id);
        await admin.auth.admin.deleteUser(id);
      } catch {
        // best-effort
      }
    }
  });

  it("User B cannot insert card_feedback claiming User A's card_id (composite FK rejects cross-user)", async () => {
    const userClient = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${userBJwt}` } },
    });

    const { data, error } = await userClient
      .from('card_feedback')
      .insert({
        card_id: cardOfAId,
        user_id: userBId,
        type: 'not_useful',
        note: 'attempting cross-user feedback',
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { data: feedbackRows } = await admin
      .from('card_feedback')
      .select('id')
      .eq('card_id', cardOfAId)
      .eq('user_id', userBId);
    expect(feedbackRows ?? []).toHaveLength(0);
  });
});
