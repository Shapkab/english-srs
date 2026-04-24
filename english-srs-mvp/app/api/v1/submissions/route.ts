import { NextResponse } from 'next/server';
import { createSubmissionSchema } from '@/lib/validators/api';
import { getSupabaseAdmin } from '@/lib/db/server';
import { requireUserId } from '@/lib/auth/user';
import { trackEvent } from '@/lib/analytics/events';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = createSubmissionSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: submission, error } = await supabase
      .from('submissions')
      .insert({
        user_id: userId,
        source_type: 'text',
        original_text: body.text,
      })
      .select('id, status')
      .single();

    if (error || !submission) throw error ?? new Error('Failed to create submission');

    await supabase.from('jobs').insert({
      type: 'analyze_submission',
      payload: { submissionId: submission.id, userId },
      status: 'pending',
    });

    trackEvent('submission_created', { userId, submissionId: submission.id });

    return NextResponse.json({ submissionId: submission.id, status: submission.status }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
