import { NextResponse } from 'next/server';
import { createSubmissionSchema } from '@/lib/validators/api';
import { requireUserContext } from '@/lib/auth/user';
import { getSupabaseAdmin } from '@/lib/db/server';
import { trackEvent } from '@/lib/analytics/events';
import { toErrorResponse } from '@/lib/http/errors';

/** Maximum submissions per user per hour. Balances active practice
 *  against cost (each submission triggers AI analysis at ~$0.01-0.05). */
const RATE_LIMIT_SUBMISSIONS_PER_HOUR = 30;
/** Maximum submissions per user per rolling 24h. Caps worst-case daily
 *  OpenAI spend on top of the hourly burst limit (M4). */
const RATE_LIMIT_SUBMISSIONS_PER_DAY = 100;

export async function POST(request: Request) {
  try {
    const { userId, supabase } = await requireUserContext(request);
    const body = createSubmissionSchema.parse(await request.json());

    const admin = getSupabaseAdmin();

    // Check the daily cap first so an hourly token is not consumed when the
    // daily cap is already hit (M4).
    const { data: dailyData, error: dailyErr } = await admin.rpc('check_and_consume_rate_limit', {
      p_user_id: userId,
      p_bucket: 'ai_daily',
      p_max: RATE_LIMIT_SUBMISSIONS_PER_DAY,
      p_window_seconds: 86400,
    });
    if (dailyErr) throw dailyErr;
    const daily = dailyData?.[0];
    if (!daily?.allowed) {
      const resetAtMs = daily?.reset_at
        ? new Date(daily.reset_at).getTime()
        : Date.now() + 86400_000;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
      return NextResponse.json(
        {
          code: 'rate_limited',
          message: "You've reached your daily submission limit.",
          resetAt: daily?.reset_at ?? new Date(resetAtMs).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_SUBMISSIONS_PER_DAY),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetAtMs / 1000)),
            'Retry-After': String(retryAfterSeconds),
          },
        },
      );
    }

    const { data: rlData, error: rlErr } = await admin.rpc('check_and_consume_rate_limit', {
      p_user_id: userId,
      p_bucket: 'submissions',
      p_max: RATE_LIMIT_SUBMISSIONS_PER_HOUR,
      p_window_seconds: 3600,
    });
    if (rlErr) throw rlErr;
    const rl = rlData?.[0];
    if (!rl?.allowed) {
      const resetAtMs = rl?.reset_at ? new Date(rl.reset_at).getTime() : Date.now() + 3600_000;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
      return NextResponse.json(
        {
          code: 'rate_limited',
          message: "You've reached your hourly submission limit.",
          resetAt: rl?.reset_at ?? new Date(resetAtMs).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_SUBMISSIONS_PER_HOUR),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetAtMs / 1000)),
            'Retry-After': String(retryAfterSeconds),
          },
        },
      );
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
