/* eslint-disable no-console */

type Fields = Record<string, unknown>;

function emit(level: 'error' | 'warn' | 'info' | 'debug', event: string, fields: Fields) {
  console.error(JSON.stringify({ level, time: new Date().toISOString(), event, ...fields }));
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
