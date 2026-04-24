import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/user';

const relatedCardSchema = z.object({
  id: z.string().uuid(),
  card_type: z.string(),
  front: z.string(),
  hint: z.string().nullable(),
  status: z.string(),
});

const reviewQueueRowSchema = z.object({
  due_at: z.string(),
  cards: z.union([relatedCardSchema, z.array(relatedCardSchema).max(1)]),
});

export async function GET(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('srs_state')
      .select('due_at, cards!inner(id, card_type, front, hint, status)')
      .eq('user_id', userId)
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    const parsedRows = z.array(reviewQueueRowSchema).parse(data ?? []);
    const cards = parsedRows
      .map((row) => ({
        due_at: row.due_at,
        card: Array.isArray(row.cards) ? row.cards[0] ?? null : row.cards,
      }))
      .filter((row) => row.card?.status === 'active')
      .map((row) => {
        const card = row.card!;
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
