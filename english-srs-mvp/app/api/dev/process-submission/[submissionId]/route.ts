import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/user';
import { processSubmission } from '@/lib/services/process-submission.service';

export async function POST(_: Request, context: { params: Promise<{ submissionId: string }> }) {
  try {
    const userId = await requireUserId();
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
