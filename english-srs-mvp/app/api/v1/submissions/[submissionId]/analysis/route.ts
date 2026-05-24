import { requireUserContext } from '@/lib/auth/user';
import { uuidParam } from '@/lib/validators/path-params';
import { HttpError, toErrorResponse } from '@/lib/http/errors';
import { masteryLevelsByLearningTarget } from '@/lib/srs/mastery';
import { computeLinkKind } from '@/lib/ui/link-kind';
import { jsonWithRequestId, withRequestId } from '@/lib/observability/log';

/** Map an internal failure to a user-safe message. The raw failure_reason
 *  can carry OpenAI/SDK internals, so it must never reach the client (L1).
 *  The raw text remains stored server-side for debugging. */
function safeFailureReason(status: string): string | null {
  return status === 'failed' ? 'Analysis failed. Please try resubmitting.' : null;
}

export async function GET(request: Request, context: { params: Promise<{ submissionId: string }> }) {
  const { requestId } = withRequestId(request);
  try {
    const { userId, supabase } = await requireUserContext(request);
    const { submissionId: rawSubmissionId } = await context.params;
    const submissionId = uuidParam.parse(rawSubmissionId);

    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id, status, failure_reason, original_text, created_at')
      .eq('id', submissionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!submission) throw new HttpError(404, 'not_found');

    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select('corrected_text, summary')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (analysisError) throw analysisError;

    const { data: issues, error: issuesError } = await supabase
      .from('analysis_issues')
      .select(
        'id, category, subcategory, error_text, corrected_text, explanation_short, confidence, severity, should_create_card, created_at',
      )
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (issuesError) throw issuesError;

    const issueIds = (issues ?? []).map((i) => i.id);
    let evidenceByIssue: Record<string, { ltId: string }> = {};
    let ltById: Record<
      string,
      {
        id: string;
        title: string;
        category: string;
        seenCount: number;
        firstSeenAt: string;
        masteryLevel: number;
      }
    > = {};
    if (issueIds.length > 0) {
      const { data: evidence, error: evErr } = await supabase
        .from('learning_target_evidence')
        .select('analysis_issue_id, learning_target_id')
        .in('analysis_issue_id', issueIds)
        .eq('user_id', userId);
      if (evErr) throw evErr;
      for (const e of evidence ?? []) {
        evidenceByIssue[e.analysis_issue_id] = { ltId: e.learning_target_id };
      }
      const ltIds = Array.from(new Set(Object.values(evidenceByIssue).map((v) => v.ltId)));
      if (ltIds.length > 0) {
        const { data: lts, error: ltErr } = await supabase
          .from('learning_targets')
          .select('id, display_title, category, seen_count, first_seen_at')
          .in('id', ltIds)
          .eq('user_id', userId);
        if (ltErr) throw ltErr;
        const masteryByLt = await masteryLevelsByLearningTarget(supabase, userId, ltIds);
        for (const t of lts ?? []) {
          ltById[t.id] = {
            id: t.id,
            title: t.display_title,
            category: t.category,
            seenCount: t.seen_count ?? 1,
            firstSeenAt: t.first_seen_at,
            masteryLevel: masteryByLt[t.id] ?? 0,
          };
        }
      }
    }

    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id, front, back, hint, card_type, status, learning_target_id, created_at')
      .eq('source_submission_id', submissionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (cardsError) throw cardsError;

    const submissionCreatedAt = submission.created_at;

    return jsonWithRequestId(
      {
        status: submission.status,
        failureReason: safeFailureReason(submission.status),
        originalText: submission.original_text,
        createdAt: submission.created_at,
        correctedText: analysis?.corrected_text ?? null,
        summary: analysis?.summary ?? null,
        issues: (issues ?? []).map((issue) => {
          const ev = evidenceByIssue[issue.id];
          const lt = ev ? ltById[ev.ltId] : null;
          const mergedOccurrences = lt && lt.seenCount > 1 ? lt.seenCount : null;
          const linkKind = computeLinkKind(
            lt ? { firstSeenAt: lt.firstSeenAt, submissionCreatedAt, seenCount: lt.seenCount } : null,
          );
          return {
            id: issue.id,
            category: issue.category,
            subcategory: issue.subcategory,
            errorText: issue.error_text,
            correctedText: issue.corrected_text,
            explanationShort: issue.explanation_short,
            confidence: issue.confidence,
            severity: issue.severity,
            shouldCreateCard: issue.should_create_card,
            learningTarget: lt
              ? {
                  id: lt.id,
                  title: lt.title,
                  category: lt.category,
                  masteryLevel: lt.masteryLevel,
                  seenCount: lt.seenCount,
                  linkKind,
                  mergedOccurrences,
                }
              : null,
          };
        }),
        cardsCreated: (cards ?? []).map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          hint: c.hint,
          cardType: c.card_type,
          status: c.status,
          learningTargetId: c.learning_target_id,
          learningTarget: c.learning_target_id ? ltById[c.learning_target_id] ?? null : null,
        })),
      },
      { requestId },
    );
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
