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
  const includeStack = process.env.NODE_ENV !== 'production' && errObj !== undefined;
  log.error('api_error', {
    requestId,
    method: request?.method,
    path: request ? new URL(request.url).pathname : undefined,
    errorName: errObj ? errObj.constructor.name : typeof error,
    message: errObj ? errObj.message : String(error),
    ...(includeStack ? { stack: errObj.stack } : {}),
  });
  return NextResponse.json({ code: 'internal_error', requestId }, { status: 500 });
}
