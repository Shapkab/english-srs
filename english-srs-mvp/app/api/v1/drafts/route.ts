import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';
import { jsonWithRequestId, withRequestId } from '@/lib/observability/log';

const putBodySchema = z.object({
  content: z.string().min(1).max(50_000),
});

export async function GET(request: Request) {
  const { requestId } = withRequestId(request);
  try {
    const { userId, supabase } = await requireUserContext(request);
    const { data, error } = await supabase
      .from('drafts')
      .select('content, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return jsonWithRequestId({ draft: data }, { requestId });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

export async function PUT(request: Request) {
  const { requestId } = withRequestId(request);
  try {
    const { userId, supabase } = await requireUserContext(request);
    const body = putBodySchema.parse(await request.json());
    const { error } = await supabase
      .from('drafts')
      .upsert(
        { user_id: userId, content: body.content, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) throw error;
    return jsonWithRequestId({ ok: true }, { requestId });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}

export async function DELETE(request: Request) {
  const { requestId } = withRequestId(request);
  try {
    const { userId, supabase } = await requireUserContext(request);
    const { error } = await supabase.from('drafts').delete().eq('user_id', userId);
    if (error) throw error;
    return jsonWithRequestId({ ok: true }, { requestId });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
