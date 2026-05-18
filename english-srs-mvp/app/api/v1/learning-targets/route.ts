import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/user';
import { toErrorResponse } from '@/lib/http/errors';

const querySchema = z.object({
  count: z.enum(['0', '1']).optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(['due', 'mastery', 'recent']).optional(),
});

const STATUSES = ['active', 'mastering', 'mastered', 'ignored'] as const;
type Status = (typeof STATUSES)[number];

export async function GET(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const url = new URL(request.url);
    const params = querySchema.parse(Object.fromEntries(url.searchParams));

    const statuses: Status[] = (params.status?.split(',') ?? ['active', 'mastering']).filter(
      (s): s is Status => (STATUSES as readonly string[]).includes(s),
    );

    if (params.count === '1') {
      const { count, error } = await supabase
        .from('learning_targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', statuses);
      if (error) throw error;
      return NextResponse.json({ total: count ?? 0 });
    }

    const { data: targets, error } = await supabase
      .from('learning_targets')
      .select(
        'id, canonical_key, display_title, category, subcategory, explanation_short, status, seen_count, first_seen_at, last_seen_at, updated_at',
      )
      .eq('user_id', userId)
      .in('status', statuses)
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    // Filter category client-side if provided (categories are text in DB)
    const filtered = params.category
      ? (targets ?? []).filter((t) => t.category === params.category)
      : targets ?? [];

    // Pull next due timestamps per target from srs_state via cards (best-effort)
    const ids = filtered.map((t) => t.id);
    let nextDueByTarget: Record<string, string | null> = {};
    let cardsPerTarget: Record<string, { total: number; active: number }> = {};
    if (ids.length > 0) {
      const { data: cards, error: cardsErr } = await supabase
        .from('cards')
        .select('id, learning_target_id, status, srs_state(due_at)')
        .eq('user_id', userId)
        .in('learning_target_id', ids);
      if (cardsErr) throw cardsErr;
      for (const c of cards ?? []) {
        const ltId = c.learning_target_id as string;
        const counts = (cardsPerTarget[ltId] ??= { total: 0, active: 0 });
        counts.total += 1;
        if (c.status === 'active') counts.active += 1;
        const srs = (c as unknown as { srs_state?: { due_at: string } | { due_at: string }[] | null }).srs_state;
        const srsRow = Array.isArray(srs) ? srs[0] : srs;
        const due = srsRow?.due_at;
        if (due) {
          const prev = nextDueByTarget[ltId];
          if (!prev || due < prev) nextDueByTarget[ltId] = due;
        } else if (!(ltId in nextDueByTarget)) {
          nextDueByTarget[ltId] = null;
        }
      }
    }

    const result = filtered.map((t) => {
      const counts = cardsPerTarget[t.id] ?? { total: 0, active: 0 };
      return {
        id: t.id,
        canonicalKey: t.canonical_key,
        displayTitle: t.display_title,
        category: t.category,
        subcategory: t.subcategory,
        explanationShort: t.explanation_short,
        status: t.status,
        masteryScore: 0,
        masteryLevel: 0,
        seenCount: t.seen_count,
        cardsTotal: counts.total,
        cardsActive: counts.active,
        nextDueAt: nextDueByTarget[t.id] ?? null,
        firstSeenAt: t.first_seen_at,
        lastSeenAt: t.last_seen_at,
      };
    });

    if (params.sort === 'mastery') {
      result.sort((a, b) => a.masteryScore - b.masteryScore);
    } else if (params.sort === 'recent') {
      result.sort((a, b) => (b.lastSeenAt > a.lastSeenAt ? 1 : -1));
    } else {
      // 'due' first
      result.sort((a, b) => {
        if (!a.nextDueAt && !b.nextDueAt) return 0;
        if (!a.nextDueAt) return 1;
        if (!b.nextDueAt) return -1;
        return a.nextDueAt < b.nextDueAt ? -1 : 1;
      });
    }

    return NextResponse.json({ targets: result });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
