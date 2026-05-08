import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping persist_submission_analysis tests — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY (e.g. via .env.local + npx supabase start) to run them.',
  );
}

interface PersistResult {
  analysis_id: string;
  inserted_issue_ids: string[];
  created_card_ids: string[];
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

suite('persist_submission_analysis', () => {
  let admin: SupabaseClient;
  let userId: string;
  let otherUserId: string;
  let submissionId: string;

  const issues = [
    {
      errorText: 'I goed',
      correctedText: 'I went',
      category: 'tense',
      subcategory: 'past simple',
      explanationShort: 'Use the past simple "went" instead of "goed".',
      confidence: 0.95,
      severity: 4,
      teachability: 5,
      shouldCreateCard: true,
    },
    {
      errorText: 'school yesterday',
      correctedText: 'school yesterday',
      category: 'style',
      subcategory: null,
      explanationShort: 'No issue, illustrative second row.',
      confidence: 0.6,
      severity: 1,
      teachability: 2,
      shouldCreateCard: false,
    },
  ];

  const normalizedTargets = [
    {
      canonicalKey: 'tense:past_simple:i went',
      displayTitle: 'I went',
      category: 'tense',
      subcategory: 'past simple',
      explanationShort: 'Use the past simple "went" instead of "goed".',
    },
  ];

  const cardCandidates = [
    {
      issueIndex: 0,
      candidate: {
        cardType: 'correction',
        front: 'I ___ to school yesterday.',
        back: 'went',
        hint: 'past simple of go',
        example: 'I went to school yesterday.',
        priority: 80,
      },
    },
  ];

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `persist-test-a-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (createErr || !created.user) throw createErr ?? new Error('createUser A failed');
    userId = created.user.id;

    const { data: createdB, error: createErrB } = await admin.auth.admin.createUser({
      email: `persist-test-b-${suffix()}@example.com`,
      password: 'probe-Pass!23',
      email_confirm: true,
    });
    if (createErrB || !createdB.user) throw createErrB ?? new Error('createUser B failed');
    otherUserId = createdB.user.id;

    const { data: submission, error: subErr } = await admin
      .from('submissions')
      .insert({ user_id: userId, source_type: 'text', original_text: 'I goed to school yesterday.' })
      .select('id')
      .single();
    if (subErr || !submission) throw subErr ?? new Error('seed submission failed');
    submissionId = submission.id;
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

  it('happy path: persists analysis, issues, target, card, srs_state and flips status', async () => {
    const { data, error } = await admin.rpc('persist_submission_analysis', {
      p_submission_id: submissionId,
      p_user_id: userId,
      p_model: 'test-model',
      p_corrected_text: 'I went to school yesterday.',
      p_summary: 'Past simple correction.',
      p_schema_version: '1.0.0',
      p_issues: issues,
      p_normalized_targets: normalizedTargets,
      p_card_candidates: cardCandidates,
    } as never);
    expect(error).toBeNull();

    const result = (Array.isArray(data) ? data[0] : data) as PersistResult;
    expect(result.analysis_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.inserted_issue_ids).toHaveLength(2);
    expect(result.created_card_ids).toHaveLength(1);

    const { data: analyses } = await admin
      .from('analyses')
      .select('id, submission_id')
      .eq('submission_id', submissionId);
    expect(analyses ?? []).toHaveLength(1);

    const { data: issuesRows } = await admin
      .from('analysis_issues')
      .select('id')
      .eq('analysis_id', result.analysis_id);
    expect(issuesRows ?? []).toHaveLength(2);

    const { data: targets } = await admin
      .from('learning_targets')
      .select('id, canonical_key')
      .eq('user_id', userId);
    expect((targets ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: cardsRows } = await admin
      .from('cards')
      .select('id')
      .eq('source_submission_id', submissionId)
      .eq('user_id', userId);
    expect(cardsRows ?? []).toHaveLength(1);

    const { data: srsRows } = await admin
      .from('srs_state')
      .select('card_id')
      .eq('user_id', userId)
      .eq('card_id', cardsRows![0].id);
    expect(srsRows ?? []).toHaveLength(1);

    const { data: subRow } = await admin
      .from('submissions')
      .select('status')
      .eq('id', submissionId)
      .single();
    expect(subRow?.status).toBe('analyzed');
  });

  it('idempotency replay: second call with same payload does not duplicate rows', async () => {
    const before = await admin
      .from('analysis_issues')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submissionId);
    const cardsBefore = await admin
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('source_submission_id', submissionId)
      .eq('user_id', userId);
    const targetsBefore = await admin
      .from('learning_targets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await admin.rpc('persist_submission_analysis', {
      p_submission_id: submissionId,
      p_user_id: userId,
      p_model: 'test-model',
      p_corrected_text: 'I went to school yesterday.',
      p_summary: 'Past simple correction.',
      p_schema_version: '1.0.0',
      p_issues: issues,
      p_normalized_targets: normalizedTargets,
      p_card_candidates: cardCandidates,
    } as never);
    expect(error).toBeNull();

    const result = (Array.isArray(data) ? data[0] : data) as PersistResult;
    expect(result.analysis_id).toMatch(/^[0-9a-f-]{36}$/i);

    const after = await admin
      .from('analysis_issues')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submissionId);
    const cardsAfter = await admin
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('source_submission_id', submissionId)
      .eq('user_id', userId);
    const targetsAfter = await admin
      .from('learning_targets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    expect(after.count).toBe(before.count);
    expect(cardsAfter.count).toBe(cardsBefore.count);
    expect(targetsAfter.count).toBe(targetsBefore.count);
  });

  it('ownership rejection: rpc errors when p_user_id does not own the submission', async () => {
    const { error } = await admin.rpc('persist_submission_analysis', {
      p_submission_id: submissionId,
      p_user_id: otherUserId,
      p_model: 'test-model',
      p_corrected_text: 'irrelevant',
      p_summary: null,
      p_schema_version: '1.0.0',
      p_issues: [],
      p_normalized_targets: [],
      p_card_candidates: [],
    } as never);
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });
});
