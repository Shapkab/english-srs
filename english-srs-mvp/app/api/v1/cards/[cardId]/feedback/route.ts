import { NextResponse } from 'next/server';
import { feedbackSchema } from '@/lib/validators/api';
import { getSupabaseAdmin } from '@/lib/db/server';
import { requireUserId } from '@/lib/auth/user';

export async function POST(request: Request, context: { params: Promise<{ cardId: string }> }) {
  try {
    const userId = await requireUserId();
    const { cardId } = await context.params;
    const body = feedbackSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    await supabase.from('card_feedback').insert({
      card_id: cardId,
      user_id: userId,
      type: body.type,
      note: body.note ?? null,
    });

    if (body.type === 'duplicate' || body.type === 'wrong' || body.type === 'not_useful') {
      await supabase.from('cards').update({ status: 'suspended' }).eq('id', cardId).eq('user_id', userId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
