import { NextResponse } from 'next/server';
import { reviewSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { updateSrsState } from '@/lib/srs/update-srs';

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

    const { error: reviewInsertError } = await supabase.from('reviews').insert({
      card_id: body.cardId,
      user_id: userId,
      rating: body.rating,
      response_ms: body.responseMs ?? null,
    });
    if (reviewInsertError) throw reviewInsertError;

    const { error: srsUpdateError } = await supabase
      .from('srs_state')
      .update({
        repetition: updated.repetition,
        interval_days: updated.intervalDays,
        ease_factor: updated.easeFactor,
        lapse_count: updated.lapseCount,
        due_at: updated.dueAt,
        last_reviewed_at: updated.lastReviewedAt,
      })
      .eq('card_id', body.cardId)
      .eq('user_id', userId);
    if (srsUpdateError) throw srsUpdateError;

    return NextResponse.json({ ok: true, nextDueAt: updated.dueAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
