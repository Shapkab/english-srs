import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/server';
import { requireUserId } from '@/lib/auth/user';

export async function GET(_: Request, context: { params: Promise<{ submissionId: string }> }) {
  try {
    const userId = await requireUserId();
    const { submissionId } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: analysis } = await supabase
      .from('analyses')
      .select('corrected_text, summary')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .maybeSingle();

    const { data: issues } = await supabase
      .from('analysis_issues')
      .select('id, category, error_text, corrected_text, explanation_short, confidence, should_create_card')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    const { data: cards } = await supabase
      .from('cards')
      .select('id, front, back')
      .eq('source_submission_id', submissionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

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
