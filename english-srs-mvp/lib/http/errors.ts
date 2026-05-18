import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { log, withRequestId } from '@/lib/observability/log';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function toErrorResponse(error: unknown, request?: Request): NextResponse {
  const requestId = request
    ? withRequestId(request).requestId
    : crypto.randomUUID();

  if (error instanceof HttpError) {
    return NextResponse.json(
      { code: error.code, requestId },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { code: 'validation_error', issues: error.issues, requestId },
      { status: 400 },
    );
  }

  const errObj = error instanceof Error ? error : undefined;
  const { errorName, message } = errObj
    ? { errorName: errObj.constructor.name, message: errObj.message }
    : describeNonError(error);
  const includeStack = process.env.NODE_ENV !== 'production' && errObj !== undefined;
  log.error('api_error', {
    requestId,
    method: request?.method,
    path: request ? new URL(request.url).pathname : undefined,
    errorName,
    message,
    ...(includeStack ? { stack: errObj.stack } : {}),
  });
  return NextResponse.json({ code: 'internal_error', requestId }, { status: 500 });
}

// Supabase's PostgrestError is a plain object, not an Error instance. Without
// this, those throws log as `errorName:"object" message:"[object Object]"` and
// the real cause is invisible. Pull out the documented fields when present.
function describeNonError(error: unknown): { errorName: string; message: string } {
  if (error === null || typeof error !== 'object') {
    return { errorName: error === null ? 'null' : typeof error, message: String(error) };
  }
  const obj = error as Record<string, unknown>;
  const str = (k: string): string | undefined =>
    typeof obj[k] === 'string' && (obj[k] as string).length > 0 ? (obj[k] as string) : undefined;
  const code = str('code');
  const baseMessage = str('message') ?? safeJson(obj);
  const extras = [str('details'), str('hint')].filter(Boolean).join(' | ');
  const message = extras ? `${baseMessage} — ${extras}` : baseMessage;
  const name = str('name') ?? (code ? `PostgrestError(${code})` : 'object');
  return { errorName: name, message };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
