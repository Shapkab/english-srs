/* eslint-disable no-console */

import { NextResponse } from 'next/server';

type Fields = Record<string, unknown>;

function emit(level: 'error' | 'warn' | 'info' | 'debug', event: string, fields: Fields) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), event, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  error: (event: string, fields: Fields = {}) => emit('error', event, fields),
  warn: (event: string, fields: Fields = {}) => emit('warn', event, fields),
  info: (event: string, fields: Fields = {}) => emit('info', event, fields),
  debug: (event: string, fields: Fields = {}) => emit('debug', event, fields),
};

export function withRequestId(request: Request): { requestId: string } {
  const headerVal = request.headers.get('x-request-id');
  return {
    requestId: headerVal && headerVal.length > 0 ? headerVal : crypto.randomUUID(),
  };
}

/** JSON response helper that stamps `X-Request-Id` on every success
 *  response, mirroring what `toErrorResponse` does for failures.
 *  Preserves any caller-provided headers in `init.headers`. */
export function jsonWithRequestId(
  payload: unknown,
  init: ResponseInit & { requestId: string },
): Response {
  const { requestId, headers, ...rest } = init;
  const merged = new Headers(headers);
  merged.set('X-Request-Id', requestId);
  return NextResponse.json(payload, { ...rest, headers: merged });
}
