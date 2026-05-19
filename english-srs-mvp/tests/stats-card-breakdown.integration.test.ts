import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GET as statsGet } from '@/app/api/v1/stats/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && anonKey && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn('[tests] Skipping stats-card-breakdown tests — set Supabase env vars to run them.');
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Fixtures {
  admin: SupabaseClient;
  userId: string;
  accessToken: string;
  learningTargetId: string;
}

async function seedSubmission(f: Fixtures, label: string): Promise<string> {
  const { data, error } = await f.admin
    .from('submissions')
    .insert({ user_id: f.userId, source_type: 'text', original_text: `seed ${label} ${suffix()}` })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error(`seed submission ${label} failed`);
  return data.id as string;
}

async function seedCardWithSrs(
  f: Fixtures,
  opts: {
    label: string;
    repetition: number;
    lapseCount: number;
    dueAtIso: string;
    cardStatus?: 'active' | 'suspended';
    cardType?: 'correction' | 'cloze' | 'usage' | 'choice';
  },
): Promise<string> {
  const submissionId = await seedSubmission(f, opts.label);
  const { data: card, error: cardErr } = await f.admin
    .from('cards')
    .insert({
      user_id: f.userId,
      learning_target_id: f.learningTargetId,
      source_submission_id: submissionId,
      card_type: opts.cardType ?? 'correction',
      front: `front-${opts.label}`,
      back: `back-${opts.label}`,
      status: opts.cardStatus ?? 'active',
    })
    .select('id')
    .single();
  if (cardErr || !card) throw cardErr ?? new Error(`seed card ${opts.label} failed`);

  const { error: srsErr } = await f.admin.from('srs_state').insert({
    card_id: card.id,
    user_id: f.userId,
    repetition: opts.repetition,
    interval_days: 0,
    ease_factor: 2.5,
    due_at: opts.dueAtIso,
    lapse_count: opts.lapseCount,
  });
  if (srsErr) throw srsErr;

  return card.id as string;
}

suite('GET /api/v1/stats cardBreakdown', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    const admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `stats-Pass!${suffix()}`;
    const email = `stats-${suffix()}@example.com`;

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
        canonical_key: `stats-${suffix()}`,
        display_title: 'stats seed',
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: 'stats.',
      })
      .select('id')
      .single();
    if (ltErr || !lt) throw ltErr ?? new Error('seed learning_target failed');

    fixtures = { admin, userId, accessToken, learningTargetId: lt.id as string };
  });

  afterAll(async () => {
    if (!fixtures) return;
    try {
      await fixtures.admin.from('srs_state').delete().eq('user_id', fixtures.userId);
      await fixtures.admin.from('cards').delete().eq('user_id', fixtures.userId);
      await fixtures.admin.from('learning_targets').delete().eq('user_id', fixtures.userId);
      await fixtures.admin.from('submissions').delete().eq('user_id', fixtures.userId);
      await fixtures.admin.from('users_profile').delete().eq('id', fixtures.userId);
      await fixtures.admin.auth.admin.deleteUser(fixtures.userId);
    } catch {
      // best-effort
    }
  });

  it('classifies one card per bucket and excludes suspended + not-yet-due cards', async () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const futureDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // One card in each of the four buckets, due now.
    await seedCardWithSrs(fixtures, {
      label: 'new',
      repetition: 0,
      lapseCount: 0,
      dueAtIso: pastDue,
      cardType: 'correction',
    });
    await seedCardWithSrs(fixtures, {
      label: 'learning',
      repetition: 1,
      lapseCount: 0,
      dueAtIso: pastDue,
      cardType: 'cloze',
    });
    await seedCardWithSrs(fixtures, {
      label: 'review',
      repetition: 5,
      lapseCount: 0,
      dueAtIso: pastDue,
      cardType: 'usage',
    });
    await seedCardWithSrs(fixtures, {
      label: 'relearning',
      repetition: 1,
      lapseCount: 2,
      dueAtIso: pastDue,
      cardType: 'choice',
    });

    // Negative-control 1: suspended card with past due_at — must NOT appear in any bucket.
    await seedCardWithSrs(fixtures, {
      label: 'suspended-past-due',
      repetition: 0,
      lapseCount: 0,
      dueAtIso: pastDue,
      cardStatus: 'suspended',
      cardType: 'correction',
    });

    // Negative-control 2: active card with future due_at — must NOT appear in any bucket.
    await seedCardWithSrs(fixtures, {
      label: 'not-yet-due',
      repetition: 0,
      lapseCount: 0,
      dueAtIso: futureDue,
      cardType: 'cloze',
    });

    const req = new Request('http://localhost/api/v1/stats', {
      method: 'GET',
      headers: { authorization: `Bearer ${fixtures.accessToken}` },
    });
    const res = await statsGet(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cardBreakdown: { new: number; learning: number; review: number; relearning: number };
    };

    expect(body.cardBreakdown).toEqual({ new: 1, learning: 1, review: 1, relearning: 1 });

    const sum =
      body.cardBreakdown.new +
      body.cardBreakdown.learning +
      body.cardBreakdown.review +
      body.cardBreakdown.relearning;
    expect(sum).toBe(4);
  });
});
