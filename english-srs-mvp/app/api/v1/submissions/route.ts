import { NextResponse } from 'next/server';
import { createSubmissionSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { getSupabaseAdmin } from '@/lib/db/server';
import { trackEvent } from '@/lib/analytics/events';
import { HttpError, toErrorResponse } from '@/lib/http/errors';

const RATE_LIMIT_SUBMISSIONS_PER_HOUR = 30;

export async function POST(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const body = createSubmissionSchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const { data: rlData, error: rlErr } = await admin.rpc('check_and_consume_rate_limit', {
      p_user_id: userId,
      p_bucket: 'submissions',
      p_max: RATE_LIMIT_SUBMISSIONS_PER_HOUR,
      p_window_seconds: 3600,
    });
    if (rlErr) throw rlErr;
    const rl = rlData?.[0];
    if (!rl?.allowed) {
      throw new HttpError(429, 'rate_limited');
    }

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

    const { error: jobInsertError } = await admin
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
    return toErrorResponse(error, request);
  }
}

export async function GET(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);

    const { data, error } = await supabase
      .from('submissions')
      .select('id, status, original_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ submissions: data ?? [] });
  } catch (error) {
    return toErrorResponse(error, request);
  }
}
