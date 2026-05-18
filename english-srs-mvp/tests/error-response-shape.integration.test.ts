import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { toErrorResponse, HttpError } from '@/lib/http/errors';
import { ZodError } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('toErrorResponse (R-014 structured logger wiring)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: MockInstance<any[], void>;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  function setNodeEnv(value: string | undefined) {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = value;
  }

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    setNodeEnv(ORIGINAL_NODE_ENV);
  });

  it('internal error: emits a JSON log line + 500 body with matching requestId', async () => {
    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: { 'x-request-id': 'rid-internal-error-test' },
    });
    const response = toErrorResponse(new Error('boom — synthetic'), request);
    expect(response.status).toBe(500);

    const body = (await response.json()) as { code: string; requestId: string };
    expect(body.code).toBe('internal_error');
    expect(body.requestId).toBe('rid-internal-error-test');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged.level).toBe('error');
    expect(logged.event).toBe('api_error');
    expect(logged.requestId).toBe('rid-internal-error-test');
    expect(logged.method).toBe('POST');
    expect(logged.path).toBe('/api/v1/submissions');
    expect(logged.errorName).toBe('Error');
    expect(logged.message).toBe('boom — synthetic');
  });

  it('HttpError: returns its status/code with a requestId; does NOT log', async () => {
    const request = new Request('http://localhost/api/v1/submissions');
    const response = toErrorResponse(new HttpError(401, 'unauthorized'), request);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string; requestId: string };
    expect(body.code).toBe('unauthorized');
    expect(body.requestId).toMatch(UUID_REGEX);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('ZodError: 400 validation_error with issues + requestId; does NOT log', async () => {
    const zodErr = new ZodError([
      { code: 'custom', path: ['x'], message: 'nope' },
    ]);
    const request = new Request('http://localhost/api/v1/submissions');
    const response = toErrorResponse(zodErr, request);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; requestId: string; issues: unknown[] };
    expect(body.code).toBe('validation_error');
    expect(body.requestId).toMatch(UUID_REGEX);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBe(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('falls back to a generated UUID when request is omitted', async () => {
    const response = toErrorResponse(new Error('no-req'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string; requestId: string };
    expect(body.code).toBe('internal_error');
    expect(body.requestId).toMatch(UUID_REGEX);
  });

  it('NODE_ENV=production: api_error log omits the stack field; 500 body never carries it', async () => {
    setNodeEnv('production');
    const request = new Request('http://localhost/api/v1/submissions', { method: 'POST' });
    const response = toErrorResponse(new Error('boom — prod'), request);
    expect(response.status).toBe(500);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe('internal_error');
    expect(typeof body.requestId).toBe('string');
    expect('stack' in body).toBe(false); // 500 body never carries stack

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged.event).toBe('api_error');
    expect(logged.errorName).toBe('Error');
    expect(logged.message).toBe('boom — prod');
    expect('stack' in logged).toBe(false); // production omits stack from logs
  });

  it('non-Error throwable (Postgrest-shape): logs message/code/details — never [object Object]', async () => {
    const postgrestLike = {
      message: 'permission denied for table submissions',
      code: '42501',
      details: 'role "anon" lacks INSERT',
      hint: 'check RLS policy',
    };
    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: { 'x-request-id': 'rid-postgrest' },
    });
    const response = toErrorResponse(postgrestLike, request);
    expect(response.status).toBe(500);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged.errorName).toBe('PostgrestError(42501)');
    expect(logged.message).toBe(
      'permission denied for table submissions — role "anon" lacks INSERT | check RLS policy',
    );
    // Sanity: the old failure mode must not regress.
    expect(logged.message).not.toBe('[object Object]');
    expect(logged.errorName).not.toBe('object');
  });

  it('non-Error throwable (bare string): logs the string', async () => {
    const response = toErrorResponse('boom-string');
    expect(response.status).toBe(500);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged.errorName).toBe('string');
    expect(logged.message).toBe('boom-string');
  });

  it('NODE_ENV=development: api_error log includes the stack field', async () => {
    setNodeEnv('development');
    const request = new Request('http://localhost/api/v1/submissions', { method: 'POST' });
    const response = toErrorResponse(new Error('boom — dev'), request);
    expect(response.status).toBe(500);

    const body = (await response.json()) as Record<string, unknown>;
    expect('stack' in body).toBe(false); // 500 body shape is unchanged

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(typeof logged.stack).toBe('string');
    expect(logged.stack as string).toMatch(/(^Error:|\bat\s)/); // recognisable stack-trace shape
  });
});
