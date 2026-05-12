import { NextResponse } from 'next/server';
import { reviewSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/db/server';

export async function POST(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const body = reviewSchema.parse(await request.json());

    // Defense-in-depth ownership gate via RLS before the (admin-scoped) RPC.
    const { data: state, error: stateError } = await supabase
      .from('srs_state')
      .select('card_id')
      .eq('card_id', body.cardId)
      .eq('user_id', userId)
      .single();

    if (stateError || !state) throw stateError ?? new Error('SRS state not found');

    const { data: nextDueAt, error: rpcError } = await getSupabaseAdmin().rpc(
      'record_review',
      {
        p_card_id: body.cardId,
        p_user_id: userId,
        p_rating: body.rating,
        p_response_ms: body.responseMs ?? null,
      } as never,
    );
    if (rpcError) throw rpcError;

    return NextResponse.json({ ok: true, nextDueAt });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
