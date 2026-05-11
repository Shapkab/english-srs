import { NextResponse } from 'next/server';
import { createSubmissionSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { getSupabaseAdmin } from '@/lib/db/server';
import { trackEvent } from '@/lib/analytics/events';
import { toErrorResponse } from '@/lib/http/errors';

export async function POST(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const body = createSubmissionSchema.parse(await request.json());

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

    const { error: jobInsertError } = await getSupabaseAdmin()
      .from('jobs')
      .insert({
        type: 'analyze_submission',
        payload: { submissionId: submission.id, userId },
        status: 'pending',
      });
    if (jobInsertError) throw jobInsertError;

    trackEvent('submission_created', { userId, submissionId: submission.id });

    return NextResponse.json({ submissionId: submission.id, status: submission.status }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUserContext(request);

    const { data, error } = await supabase
      .from('submissions')
      .select('id, status, original_text, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ submissions: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
