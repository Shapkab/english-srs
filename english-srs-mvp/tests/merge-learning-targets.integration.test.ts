import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn('[tests] Skipping merge_learning_targets tests — set Supabase env vars to run them.');
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface UserCtx {
  id: string;
  targets: Record<string, string>; // label -> learning_target_id
  submissionId: string;
}

suite('merge_learning_targets RPC + persist_submission_analysis follow-through', () => {
  let admin: SupabaseClient;
  let userA: UserCtx;
  let userB: UserCtx;

  async function createUserCtx(label: string): Promise<UserCtx> {
    const email = `merge-lt-${label}-${suffix()}@example.com`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: `merge-Pass!${suffix()}`,
      email_confirm: true,
    });
    if (createErr || !created.user) throw createErr ?? new Error(`createUser ${label} failed`);

    const { data: sub, error: subErr } = await admin
      .from('submissions')
      .insert({
        user_id: created.user.id,
        source_type: 'text',
        original_text: `merge seed ${label} ${suffix()}`,
      })
      .select('id')
      .single();
    if (subErr || !sub) throw subErr ?? new Error(`seed submission ${label} failed`);

    return { id: created.user.id, targets: {}, submissionId: sub.id as string };
  }

  async function seedTarget(ctx: UserCtx, slot: string, canonicalKey: string): Promise<string> {
    const { data, error } = await admin
      .from('learning_targets')
      .insert({
        user_id: ctx.id,
        canonical_key: canonicalKey,
        display_title: `${slot} title`,
        category: 'tense',
        subcategory: 'past simple',
        explanation_short: `${slot} explanation`,
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error(`seed target ${slot} failed`);
    ctx.targets[slot] = data.id as string;
    return data.id as string;
  }

  async function seedCardUnder(ctx: UserCtx, learningTargetId: string): Promise<string> {
    // Each card needs its own submission so the unique index (with NULLS NOT
    // DISTINCT) doesn't collide on (user, target, source_submission, type).
    const { data: sub } = await admin
      .from('submissions')
      .insert({ user_id: ctx.id, source_type: 'text', original_text: `merge-card seed ${suffix()}` })
      .select('id')
      .single();
    const { data: card, error } = await admin
      .from('cards')
      .insert({
        user_id: ctx.id,
        learning_target_id: learningTargetId,
        source_submission_id: sub!.id,
        card_type: 'correction',
        front: `front ${suffix()}`,
        back: `back ${suffix()}`,
        status: 'active',
      })
      .select('id')
      .single();
    if (error || !card) throw error ?? new Error('seed card failed');
    return card.id as string;
  }

  async function seedEvidence(ctx: UserCtx, learningTargetId: string) {
    // Each call seeds a fresh submission + analysis so the unique
    // (submission_id) constraint on analyses doesn't collide.
    const { data: sub } = await admin
      .from('submissions')
      .insert({
        user_id: ctx.id,
        source_type: 'text',
        original_text: `evidence seed ${suffix()}`,
      })
      .select('id')
      .single();
    const { data: analysis, error: anaErr } = await admin
      .from('analyses')
      .insert({
        submission_id: sub!.id,
        user_id: ctx.id,
        model: 'test',
        corrected_text: 'corrected',
        schema_version: 'test-001',
      })
      .select('id')
      .single();
    if (anaErr || !analysis) throw anaErr ?? new Error('seed analysis failed');
    const { data: issue, error: issueErr } = await admin
      .from('analysis_issues')
      .insert({
        analysis_id: analysis.id,
        submission_id: sub!.id,
        user_id: ctx.id,
        error_text: `err-${suffix()}`,
        corrected_text: `corr-${suffix()}`,
        category: 'grammar',
        explanation_short: 'x',
        confidence: 0.9,
        severity: 1,
        teachability: 1,
        should_create_card: false,
      })
      .select('id')
      .single();
    if (issueErr || !issue) throw issueErr ?? new Error('seed issue failed');
    const { error } = await admin.from('learning_target_evidence').insert({
      learning_target_id: learningTargetId,
      analysis_issue_id: issue.id,
      submission_id: sub!.id,
      user_id: ctx.id,
    });
    if (error) throw error;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    userA = await createUserCtx('a');
    userB = await createUserCtx('b');

    await seedTarget(userA, 't1', `merge-K1-${suffix()}`);
    await seedTarget(userA, 't2', `merge-K2-${suffix()}`);
    await seedTarget(userB, 'b1', `merge-Kb-${suffix()}`);

    // Two cards under each of t1 and t2.
    await seedCardUnder(userA, userA.targets.t1);
    await seedCardUnder(userA, userA.targets.t1);
    await seedCardUnder(userA, userA.targets.t2);
    await seedCardUnder(userA, userA.targets.t2);

    // Two evidence rows under each of t1 and t2.
    await seedEvidence(userA, userA.targets.t1);
    await seedEvidence(userA, userA.targets.t1);
    await seedEvidence(userA, userA.targets.t2);
    await seedEvidence(userA, userA.targets.t2);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const ctx of [userA, userB].filter(Boolean)) {
      try {
        await admin.from('learning_target_evidence').delete().eq('user_id', ctx.id);
        await admin.from('analysis_issues').delete().eq('user_id', ctx.id);
        await admin.from('analyses').delete().eq('user_id', ctx.id);
        await admin.from('srs_state').delete().eq('user_id', ctx.id);
        await admin.from('cards').delete().eq('user_id', ctx.id);
        await admin.from('learning_targets').delete().eq('user_id', ctx.id);
        await admin.from('submissions').delete().eq('user_id', ctx.id);
        await admin.from('users_profile').delete().eq('id', ctx.id);
        await admin.auth.admin.deleteUser(ctx.id);
      } catch {
        // best-effort
      }
    }
  });

  it('re-points cards and evidence from t1 to t2; marks t1 merged + ignored', async () => {
    const t1 = userA.targets.t1;
    const t2 = userA.targets.t2;

    const { error } = await admin.rpc('merge_learning_targets', {
      p_from_id: t1,
      p_into_id: t2,
      p_user_id: userA.id,
    });
    expect(error).toBeNull();

    const { data: cards } = await admin
      .from('cards')
      .select('id, learning_target_id')
      .eq('user_id', userA.id);
    expect((cards ?? []).length).toBe(4);
    for (const card of cards ?? []) {
      expect(card.learning_target_id).toBe(t2);
    }

    const { data: evidence } = await admin
      .from('learning_target_evidence')
      .select('id, learning_target_id')
      .eq('user_id', userA.id);
    expect((evidence ?? []).length).toBe(4);
    for (const ev of evidence ?? []) {
      expect(ev.learning_target_id).toBe(t2);
    }

    const { data: t1Row } = await admin
      .from('learning_targets')
      .select('id, merged_into_id, status')
      .eq('id', t1)
      .single();
    expect(t1Row!.merged_into_id).toBe(t2);
    expect(t1Row!.status).toBe('ignored');
  });

  it('rejects merging across users with insufficient_privilege', async () => {
    const { error } = await admin.rpc('merge_learning_targets', {
      p_from_id: userA.targets.t2,
      p_into_id: userB.targets.b1,
      p_user_id: userA.id,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501'); // insufficient_privilege
  });

  it('rejects a self-merge with invalid_parameter_value', async () => {
    const { error } = await admin.rpc('merge_learning_targets', {
      p_from_id: userA.targets.t2,
      p_into_id: userA.targets.t2,
      p_user_id: userA.id,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('22023'); // invalid_parameter_value
  });

  it('rejects merging an already-merged target with object_not_in_prerequisite_state', async () => {
    // t1 was merged into t2 in the first test; merging t1 again must fail.
    const { error } = await admin.rpc('merge_learning_targets', {
      p_from_id: userA.targets.t1,
      p_into_id: userA.targets.t2,
      p_user_id: userA.id,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('55000'); // object_not_in_prerequisite_state
  });

  it('persist_submission_analysis follows merged_into_id when re-using the merged canonical_key', async () => {
    // Find t1's canonical_key — it still belongs to the merged-away row.
    const { data: t1Row } = await admin
      .from('learning_targets')
      .select('canonical_key')
      .eq('id', userA.targets.t1)
      .single();
    const k1 = t1Row!.canonical_key as string;

    // Fresh submission to drive PSA cleanly.
    const { data: sub } = await admin
      .from('submissions')
      .insert({
        user_id: userA.id,
        source_type: 'text',
        original_text: `psa follow-through ${suffix()}`,
      })
      .select('id')
      .single();

    const issueKey = `follow-err-${suffix()}`;
    const { data: psaRows, error: psaErr } = await admin.rpc('persist_submission_analysis', {
      p_submission_id: sub!.id,
      p_user_id: userA.id,
      p_model: 'test',
      p_corrected_text: 'corrected',
      p_summary: null,
      p_schema_version: 'test-002',
      p_issues: [
        {
          errorText: issueKey,
          correctedText: 'fixed',
          category: 'grammar',
          subcategory: null,
          explanationShort: 'x',
          confidence: 0.9,
          severity: 1,
          teachability: 1,
          shouldCreateCard: true,
        },
      ],
      p_normalized_targets: [
        {
          canonicalKey: k1,
          displayTitle: 'follow-through',
          category: 'tense',
          subcategory: 'past simple',
          explanationShort: 'x',
        },
      ],
      p_card_candidates: [
        {
          issueIndex: 0,
          candidate: {
            cardType: 'correction',
            front: `psa-front-${suffix()}`,
            back: `psa-back-${suffix()}`,
            hint: null,
            example: null,
            priority: 50,
          },
        },
      ],
    });
    expect(psaErr).toBeNull();
    expect(psaRows).not.toBeNull();

    // The created card must be under the into-row (t2), not the merged-away t1.
    const { data: createdCards } = await admin
      .from('cards')
      .select('id, learning_target_id')
      .eq('source_submission_id', sub!.id);
    expect((createdCards ?? []).length).toBeGreaterThan(0);
    for (const card of createdCards ?? []) {
      expect(card.learning_target_id).toBe(userA.targets.t2);
    }
  });
});
