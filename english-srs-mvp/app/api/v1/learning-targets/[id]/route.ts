import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/user';
import { uuidParam } from '@/lib/validators/path-params';
import { HttpError, toErrorResponse } from '@/lib/http/errors';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const { id: rawId } = await context.params;
    const targetId = uuidParam.parse(rawId);

    const { data: target, error: tErr } = await supabase
      .from('learning_targets')
      .select(
        'id, canonical_key, display_title, category, subcategory, explanation_short, seen_count, last_seen_at, status, merged_into_id',
      )
      .eq('id', targetId)
      .eq('user_id', userId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!target) throw new HttpError(404, 'not_found');

    const { data: cards, error: cErr } = await supabase
      .from('cards')
      .select(
        'id, card_type, front, back, hint, status, priority, created_at, srs_state(repetition, interval_days, ease_factor, due_at, lapse_count, last_reviewed_at)',
      )
      .eq('learning_target_id', targetId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (cErr) throw cErr;

    const { data: evidence, error: eErr } = await supabase
      .from('learning_target_evidence')
      .select('id, analysis_issue_id, submission_id, created_at')
      .eq('learning_target_id', targetId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (eErr) throw eErr;

    return NextResponse.json({
      target: {
        id: target.id,
        canonicalKey: target.canonical_key,
        displayTitle: target.display_title,
        category: target.category,
        subcategory: target.subcategory,
        explanationShort: target.explanation_short,
        seenCount: target.seen_count,
        lastSeenAt: target.last_seen_at,
        status: target.status,
        mergedIntoId: target.merged_into_id,
      },
      cards: (cards ?? []).map((c) => {
        const srs = Array.isArray(c.srs_state) ? c.srs_state[0] ?? null : c.srs_state;
        return {
          cardId: c.id,
          cardType: c.card_type,
          front: c.front,
          back: c.back,
          hint: c.hint,
          status: c.status,
          priority: c.priority,
          createdAt: c.created_at,
          srs: srs && {
            repetition: srs.repetition,
            intervalDays: srs.interval_days,
            easeFactor: srs.ease_factor,
            dueAt: srs.due_at,
            lapseCount: srs.lapse_count,
            lastReviewedAt: srs.last_reviewed_at,
          },
        };
      }),
      evidence: (evidence ?? []).map((e) => ({
        id: e.id,
        analysisIssueId: e.analysis_issue_id,
        submissionId: e.submission_id,
        createdAt: e.created_at,
      })),
    });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
