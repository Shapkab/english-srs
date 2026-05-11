import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/user';
import { uuidParam } from '@/lib/validators/path-params';
import { processSubmission } from '@/lib/services/process-submission.service';
import { toErrorResponse } from '@/lib/http/errors';

export async function POST(request: Request, context: { params: Promise<{ submissionId: string }> }) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const { userId } = await requireUserContext(request);
    const { submissionId: rawSubmissionId } = await context.params;
    const submissionId = uuidParam.parse(rawSubmissionId);

    const result = await processSubmission({ submissionId, userId });

    return NextResponse.json({ ok: true, submissionId, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
