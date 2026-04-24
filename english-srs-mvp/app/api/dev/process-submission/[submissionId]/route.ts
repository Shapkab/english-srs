import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/user';
import { processSubmission } from '@/lib/services/process-submission.service';

export async function POST(request: Request, context: { params: Promise<{ submissionId: string }> }) {
  try {
    const { userId } = await requireUserContext(request);
    const { submissionId } = await context.params;

    const result = await processSubmission({ submissionId, userId });

    return NextResponse.json({ ok: true, submissionId, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
