import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/user';

export async function GET(request: Request, context: { params: Promise<{ submissionId: string }> }) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const { submissionId } = await context.params;

    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select('corrected_text, summary')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (analysisError) throw analysisError;

    const { data: issues, error: issuesError } = await supabase
      .from('analysis_issues')
      .select('id, category, error_text, corrected_text, explanation_short, confidence, should_create_card')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (issuesError) throw issuesError;

    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id, front, back')
      .eq('source_submission_id', submissionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (cardsError) throw cardsError;

    return NextResponse.json({
      correctedText: analysis?.corrected_text ?? null,
      summary: analysis?.summary ?? null,
      issues: (issues ?? []).map((issue) => ({
        id: issue.id,
        category: issue.category,
        errorText: issue.error_text,
        correctedText: issue.corrected_text,
        explanationShort: issue.explanation_short,
        confidence: issue.confidence,
        shouldCreateCard: issue.should_create_card,
      })),
      cardsCreated: cards ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
