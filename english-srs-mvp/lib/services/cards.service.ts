import { getSupabaseAdmin } from '@/lib/db/server';
import type { CardCandidate } from '@/lib/types/domain';

export async function createCard(params: {
  userId: string;
  learningTargetId: string;
  submissionId: string;
  candidate: CardCandidate;
}) {
  const supabase = getSupabaseAdmin();

  const { data: created, error } = await supabase
    .from('cards')
    .insert({
      user_id: params.userId,
      learning_target_id: params.learningTargetId,
      source_submission_id: params.submissionId,
      card_type: params.candidate.cardType,
      front: params.candidate.front,
      back: params.candidate.back,
      hint: params.candidate.hint ?? null,
      example: params.candidate.example ?? null,
      priority: params.candidate.priority,
    })
    .select('id')
    .single();

  if (error || !created) throw error ?? new Error('Failed to create card');

  await supabase.from('srs_state').insert({
    card_id: created.id,
    user_id: params.userId,
    repetition: 0,
    interval_days: 0,
    ease_factor: 2.5,
    due_at: new Date().toISOString(),
    lapse_count: 0,
  });

  return created;
}
