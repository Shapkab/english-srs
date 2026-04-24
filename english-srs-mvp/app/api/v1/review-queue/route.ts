import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/server';
import { requireUserId } from '@/lib/auth/user';

export async function GET() {
  try {
    const userId = await requireUserId();
    const supabase = getSupabaseAdmin();

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('srs_state')
      .select('due_at, cards!inner(id, card_type, front, hint, status)')
      .eq('user_id', userId)
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    const cards = (data ?? [])
      .filter((row) => row.cards && !Array.isArray(row.cards) && row.cards.status === 'active')
      .map((row) => {
        const card = row.cards as { id: string; card_type: string; front: string; hint: string | null; status: string };
        return {
          cardId: card.id,
          cardType: card.card_type,
          front: card.front,
          hint: card.hint,
          dueAt: row.due_at,
        };
      });

    return NextResponse.json({ cards });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
