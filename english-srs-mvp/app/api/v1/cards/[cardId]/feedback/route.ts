import { feedbackSchema } from '@/lib/validators/api';
import { uuidParam } from '@/lib/validators/path-params';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';
import { jsonWithRequestId, withRequestId } from '@/lib/observability/log';

export async function POST(request: Request, context: { params: Promise<{ cardId: string }> }) {
  const { requestId } = withRequestId(request);
  try {
    const { userId, supabase } = await requireUserContext(request);
    const { cardId: rawCardId } = await context.params;
    const cardId = uuidParam.parse(rawCardId);
    const body = feedbackSchema.parse(await request.json());

    const { error: feedbackInsertError } = await supabase.from('card_feedback').insert({
      card_id: cardId,
      user_id: userId,
      type: body.type,
      note: body.note ?? null,
    });
    if (feedbackInsertError) throw feedbackInsertError;

    if (body.type === 'duplicate' || body.type === 'wrong' || body.type === 'not_useful') {
      const { error: suspendError } = await supabase
        .from('cards')
        .update({ status: 'suspended' })
        .eq('id', cardId)
        .eq('user_id', userId);
      if (suspendError) throw suspendError;
    }

    return jsonWithRequestId({ ok: true }, { requestId });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
