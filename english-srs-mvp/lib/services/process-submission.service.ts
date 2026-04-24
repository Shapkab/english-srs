import { getSupabaseAdmin } from '@/lib/db/server';
import { analyzeSubmissionText } from '@/lib/services/analysis.service';
import { normalizeIssueToLearningTarget } from '@/lib/normalization/normalize-issue';
import { upsertLearningTarget } from '@/lib/services/learning-targets.service';
import { generateCardCandidates } from '@/lib/services/card-generation.service';
import { createCard } from '@/lib/services/cards.service';
import type { AnalysisIssueDTO } from '@/lib/types/domain';

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

  const { data: analysisRow, error: analysisInsertError } = await supabase
    .from('analyses')
    .insert({
      submission_id: submissionId,
      user_id: userId,
      model: process.env.OPENAI_MODEL_ANALYSIS ?? 'gpt-4.1-mini',
      corrected_text: analysis.correctedText,
      summary: analysis.summary,
      schema_version: '1.0.0',
    })
    .select('id')
    .single();

  if (analysisInsertError || !analysisRow) throw analysisInsertError ?? new Error('Failed to create analysis row');

  const insertedIssues: Array<AnalysisIssueDTO & { id: string }> = [];
  for (const issue of analysis.issues) {
    const { data: issueRow, error: issueError } = await supabase
      .from('analysis_issues')
      .insert({
        analysis_id: analysisRow.id,
        submission_id: submissionId,
        user_id: userId,
        error_text: issue.errorText,
        corrected_text: issue.correctedText,
        category: issue.category,
        subcategory: issue.subcategory,
        explanation_short: issue.explanationShort,
        confidence: issue.confidence,
        severity: issue.severity,
        teachability: issue.teachability,
        should_create_card: issue.shouldCreateCard,
      })
      .select('id')
      .single();

    if (issueError || !issueRow) throw issueError ?? new Error('Failed to insert issue');
    insertedIssues.push({ ...issue, id: issueRow.id });
  }

  const selectedIssues = insertedIssues
    .filter((issue) => issue.shouldCreateCard && issue.confidence >= 0.8)
    .sort((a, b) => (b.teachability + b.severity) - (a.teachability + a.severity))
    .slice(0, 2);

  const createdCardIds: string[] = [];

  for (const issue of insertedIssues) {
    const normalized = normalizeIssueToLearningTarget(issue);
    const { learningTargetId } = await upsertLearningTarget({
      userId,
      normalized,
      issueId: issue.id,
      submissionId,
    });

    if (selectedIssues.some((selected) => selected.id === issue.id)) {
      const candidates = await generateCardCandidates({
        learningTargetTitle: normalized.displayTitle,
        category: normalized.category,
        explanationShort: normalized.explanationShort,
        sourceSentence: analysis.correctedText,
      });

      const topCandidate = [...candidates].sort((a, b) => b.priority - a.priority)[0];
      if (topCandidate) {
        const createdCard = await createCard({
          userId,
          learningTargetId,
          submissionId,
          candidate: topCandidate,
        });
        createdCardIds.push(createdCard.id);
      }
    }
  }

  await supabase
    .from('submissions')
    .update({ status: 'analyzed' })
    .eq('id', submissionId)
    .eq('user_id', userId);

  return {
    analysisId: analysisRow.id,
    issueCount: insertedIssues.length,
    createdCardIds,
  };
}
