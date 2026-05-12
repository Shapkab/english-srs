import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log, withRequestId } from '@/lib/observability/log';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('lib/observability/log', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: MockInstance<any[], void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: MockInstance<any[], void>;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('withRequestId returns the incoming x-request-id header when present', () => {
    const r = new Request('http://x', { headers: { 'x-request-id': 'abc-123' } });
    expect(withRequestId(r).requestId).toBe('abc-123');
  });

  it('withRequestId generates a UUID when the header is missing', () => {
    const r = new Request('http://x');
    expect(withRequestId(r).requestId).toMatch(UUID_REGEX);
  });

  it('withRequestId generates a UUID when the header is empty', () => {
    const r = new Request('http://x', { headers: { 'x-request-id': '' } });
    expect(withRequestId(r).requestId).toMatch(UUID_REGEX);
  });

  it('log.error emits one JSON line with level/time/event/fields', () => {
    log.error('event_name', { foo: 1, bar: 'baz' });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const arg = consoleErrorSpy.mock.calls[0][0];
    expect(typeof arg).toBe('string');
    const parsed = JSON.parse(arg as string) as Record<string, unknown>;
    expect(parsed.level).toBe('error');
    expect(parsed.event).toBe('event_name');
    expect(parsed.foo).toBe(1);
    expect(parsed.bar).toBe('baz');
    expect(typeof parsed.time).toBe('string');
    expect(() => new Date(parsed.time as string)).not.toThrow();
  });

  it('log.info / log.warn / log.debug carry their own level', () => {
    log.info('a');
    log.warn('b');
    log.debug('c');

    // info/debug → console.log; warn → console.error.
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    const logLevels = consoleLogSpy.mock.calls.map((call) => {
      const parsed = JSON.parse(call[0] as string) as { level: string };
      return parsed.level;
    });
    const errorLevels = consoleErrorSpy.mock.calls.map((call) => {
      const parsed = JSON.parse(call[0] as string) as { level: string };
      return parsed.level;
    });
    expect(logLevels).toEqual(['info', 'debug']);
    expect(errorLevels).toEqual(['warn']);
  });

  it('log.info writes to console.log, NOT console.error (M8 stream routing)', () => {
    log.info('an_info_event', { x: 1 });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.event).toBe('an_info_event');
    expect(parsed.x).toBe(1);
  });
});
