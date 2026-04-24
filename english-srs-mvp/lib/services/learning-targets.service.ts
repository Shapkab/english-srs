import { getSupabaseAdmin } from '@/lib/db/server';
import type { AnalysisIssueDTO, NormalizedLearningTarget } from '@/lib/types/domain';

export async function upsertLearningTarget(params: {
  userId: string;
  normalized: NormalizedLearningTarget;
  issueId: string;
  submissionId: string;
}) {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from('learning_targets')
    .select('id, seen_count, active_card_count')
    .eq('user_id', params.userId)
    .eq('canonical_key', params.normalized.canonicalKey)
    .maybeSingle();
  if (existingError) throw existingError;

  let learningTargetId: string;

  if (existing) {
    learningTargetId = existing.id;
    const { error: updateError } = await supabase
      .from('learning_targets')
      .update({
        last_seen_at: new Date().toISOString(),
        seen_count: existing.seen_count + 1,
        explanation_short: params.normalized.explanationShort,
      })
      .eq('id', learningTargetId);
    if (updateError) throw updateError;
  } else {
    const { data: created, error } = await supabase
      .from('learning_targets')
      .insert({
        user_id: params.userId,
        canonical_key: params.normalized.canonicalKey,
        display_title: params.normalized.displayTitle,
        category: params.normalized.category,
        subcategory: params.normalized.subcategory,
        explanation_short: params.normalized.explanationShort,
      })
      .select('id')
      .single();

    if (error || !created) throw error ?? new Error('Failed to create learning target');
    learningTargetId = created.id;
  }

  const { error: evidenceInsertError } = await supabase.from('learning_target_evidence').insert({
    learning_target_id: learningTargetId,
    analysis_issue_id: params.issueId,
    submission_id: params.submissionId,
    user_id: params.userId,
  });
  if (evidenceInsertError) throw evidenceInsertError;

  return { learningTargetId };
}
