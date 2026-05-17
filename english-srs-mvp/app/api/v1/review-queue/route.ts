import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';

const relatedCardSchema = z.object({
  id: z.string().uuid(),
  card_type: z.string(),
  front: z.string(),
  back: z.string(),
  hint: z.string().nullable(),
  status: z.string(),
  priority: z.number().int(),
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
      .select('due_at, cards!inner(id, card_type, front, back, hint, status, priority)')
      .eq('user_id', userId)
      .eq('cards.status', 'active')
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    const parsedRows = z.array(reviewQueueRowSchema).parse(data ?? []);
    const cards = parsedRows
      .map((row) => {
        const card = Array.isArray(row.cards) ? row.cards[0] ?? null : row.cards;
        return {
          cardId: card!.id,
          cardType: card!.card_type,
          front: card!.front,
          back: card!.back,
          hint: card!.hint,
          dueAt: row.due_at,
          priority: card!.priority,
        };
      })
      // Secondary sort: stable order so same due_at falls back to priority desc.
      // SQL-side LIMIT 20 already ran on (due_at asc); within the result set
      // we re-sort to put higher-priority cards first on ties.
      .sort((a, b) => {
        if (a.dueAt < b.dueAt) return -1;
        if (a.dueAt > b.dueAt) return 1;
        return b.priority - a.priority;
      })
      .map(({ priority: _priority, ...rest }) => rest);

    return NextResponse.json({ cards });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
