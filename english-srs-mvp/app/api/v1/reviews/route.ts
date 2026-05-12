import { NextResponse } from 'next/server';
import { reviewSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { updateSrsState } from '@/lib/srs/update-srs';
import { toErrorResponse } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/db/server';

export async function POST(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const body = reviewSchema.parse(await request.json());

    const { data: state, error: stateError } = await supabase
      .from('srs_state')
      .select('repetition, interval_days, ease_factor, lapse_count')
      .eq('card_id', body.cardId)
      .eq('user_id', userId)
      .single();

    if (stateError || !state) throw stateError ?? new Error('SRS state not found');

    const updated = updateSrsState(
      {
        repetition: state.repetition,
        intervalDays: state.interval_days,
        easeFactor: state.ease_factor,
        lapseCount: state.lapse_count,
      },
      body.rating,
    );

    const { data: nextDueAt, error: rpcError } = await getSupabaseAdmin().rpc(
      'record_review',
      {
        p_card_id: body.cardId,
        p_user_id: userId,
        p_rating: body.rating,
        p_response_ms: body.responseMs ?? null,
        p_repetition: updated.repetition,
        p_interval_days: updated.intervalDays,
        p_ease_factor: updated.easeFactor,
        p_lapse_count: updated.lapseCount,
        p_due_at: updated.dueAt,
        p_last_reviewed_at: updated.lastReviewedAt,
      } as never,
    );
    if (rpcError) throw rpcError;

    return NextResponse.json({ ok: true, nextDueAt });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
