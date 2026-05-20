import { getSupabaseAdmin } from '@/lib/db/server';
import { analyzeSubmissionText } from '@/lib/services/analysis.service';
import { normalizeIssueToLearningTarget } from '@/lib/normalization/normalize-issue';
import { generateCardCandidates } from '@/lib/services/card-generation.service';
import { ANALYSIS_SCHEMA_VERSION } from '@/lib/openai/schema-version';
import type { CardCandidate } from '@/lib/types/domain';
import type { Database, Json } from '@/lib/types/database.generated';

type PersistArgs = Database['public']['Functions']['persist_submission_analysis']['Args'];

// The interfaces we send (AnalysisIssueDTO, NormalizedLearningTarget, etc.)
// are structurally JSON-compatible at runtime but lack the index signature
// that the generated `Json` type requires. Cast through `unknown` once, here.
const asJson = (value: unknown): Json => value as Json;

interface PersistedRow {
  analysis_id: string;
  inserted_issue_ids: string[] | null;
  created_card_ids: string[] | null;
}

export async function processSubmission(params: { submissionId: string; userId: string }) {
  const supabase = getSupabaseAdmin();
  const { submissionId, userId } = params;

  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select('original_text')
    .eq('id', submissionId)
    .eq('user_id', userId)
    .single();

  if (submissionError || !submission) throw submissionError ?? new Error('Submission not found');

  const analysis = await analyzeSubmissionText(submission.original_text);

  const normalizedTargets = analysis.issues.map((issue) => normalizeIssueToLearningTarget(issue));

  const selectedIssueIndices = analysis.issues
    .map((issue, index) => ({ issue, index }))
    .filter(({ issue }) => issue.shouldCreateCard && issue.confidence >= 0.8)
    .sort(
      (a, b) =>
        b.issue.teachability + b.issue.severity - (a.issue.teachability + a.issue.severity),
    )
    .slice(0, 2)
    .map(({ index }) => index);

  const cardCandidatePromises = selectedIssueIndices.map(async (issueIndex) => {
    const normalized = normalizedTargets[issueIndex];
    const candidates = await generateCardCandidates({
      learningTargetTitle: normalized.displayTitle,
      category: normalized.category,
      explanationShort: normalized.explanationShort,
      sourceSentence: analysis.correctedText,
    });
    const top = [...candidates].sort((a, b) => b.priority - a.priority)[0];
    return top ? { issueIndex, candidate: top } : null;
  });
  const cardCandidateResults = await Promise.all(cardCandidatePromises);
  const cardCandidates = cardCandidateResults.filter(
    (r): r is { issueIndex: number; candidate: CardCandidate } => r !== null,
  );

  const rpcArgs: PersistArgs = {
    p_submission_id: submissionId,
    p_user_id: userId,
    p_model: process.env.OPENAI_MODEL_ANALYSIS ?? 'gpt-4.1-mini',
    p_corrected_text: analysis.correctedText,
    p_summary: analysis.summary ?? '',
    p_schema_version: ANALYSIS_SCHEMA_VERSION,
    p_issues: asJson(analysis.issues),
    p_normalized_targets: asJson(normalizedTargets),
    p_card_candidates: asJson(cardCandidates),
  };

  const { data: persistResult, error: persistError } = await supabase.rpc(
    'persist_submission_analysis',
    rpcArgs,
  );
  if (persistError) throw persistError;

  const row: PersistedRow | undefined = Array.isArray(persistResult)
    ? (persistResult[0] as PersistedRow | undefined)
    : (persistResult as PersistedRow | null) ?? undefined;
  if (!row) throw new Error('persist_submission_analysis returned no row');

  return {
    analysisId: row.analysis_id,
    issueCount: row.inserted_issue_ids?.length ?? 0,
    createdCardIds: row.created_card_ids ?? [],
  };
}
