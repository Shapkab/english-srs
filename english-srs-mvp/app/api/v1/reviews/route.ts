import { reviewSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';
import { getSupabaseAdmin } from '@/lib/db/server';
import { jsonWithRequestId, withRequestId } from '@/lib/observability/log';

export async function POST(request: Request) {
  const { requestId } = withRequestId(request);
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
        p_response_ms: body.responseMs ?? 0,
      },
    );
    if (rpcError) throw rpcError;

    return jsonWithRequestId({ ok: true, nextDueAt }, { requestId });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
