import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';
import { masteryLevelsByLearningTarget } from '@/lib/srs/mastery';

const relatedLearningTargetSchema = z.object({
  id: z.string().uuid(),
  display_title: z.string(),
  category: z.string(),
  seen_count: z.number().int().nullable().optional(),
});

const relatedCardSchema = z.object({
  id: z.string().uuid(),
  card_type: z.string(),
  front: z.string(),
  back: z.string(),
  hint: z.string().nullable(),
  status: z.string(),
  priority: z.number().int(),
  learning_target_id: z.string().uuid().nullable().optional(),
  learning_targets: z
    .union([relatedLearningTargetSchema, z.array(relatedLearningTargetSchema).max(1), z.null()])
    .optional(),
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
      .select(
        'due_at, cards!inner(id, card_type, front, back, hint, status, priority, learning_target_id, learning_targets(id, display_title, category, seen_count))',
      )
      .eq('user_id', userId)
      .eq('cards.status', 'active')
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    const parsedRows = z.array(reviewQueueRowSchema).parse(data ?? []);
    const draft = parsedRows
      .map((row) => {
        const card = Array.isArray(row.cards) ? row.cards[0] ?? null : row.cards;
        if (!card) return null;
        const ltRaw = card.learning_targets;
        const lt = Array.isArray(ltRaw) ? ltRaw[0] ?? null : ltRaw ?? null;
        return {
          cardId: card.id,
          cardType: card.card_type,
          front: card.front,
          back: card.back,
          hint: card.hint,
          dueAt: row.due_at,
          priority: card.priority,
          learningTarget: lt
            ? {
                id: lt.id,
                title: lt.display_title,
                category: lt.category,
                seenCount: lt.seen_count ?? 1,
              }
            : null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const ltIds = Array.from(
      new Set(draft.map((c) => c.learningTarget?.id).filter((id): id is string => !!id)),
    );
    const masteryByLt = await masteryLevelsByLearningTarget(supabase, userId, ltIds);

    const cards = draft
      .sort((a, b) => {
        if (a.dueAt < b.dueAt) return -1;
        if (a.dueAt > b.dueAt) return 1;
        return b.priority - a.priority;
      })
      .map(({ priority: _priority, learningTarget, ...rest }) => ({
        ...rest,
        learningTarget: learningTarget
          ? { ...learningTarget, masteryLevel: masteryByLt[learningTarget.id] ?? 0 }
          : null,
      }));

    return NextResponse.json({ cards });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
