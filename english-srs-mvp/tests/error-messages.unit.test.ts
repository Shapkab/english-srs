import { describe, expect, it } from 'vitest';
import { toUserMessage } from '@/lib/api/error-messages';

describe('toUserMessage', () => {
  it('maps known codes to human messages', () => {
    expect(toUserMessage({ code: 'rate_limited' }, 429)).toMatch(/hourly submission limit/i);
    expect(toUserMessage({ code: 'unauthorized' }, 401)).toMatch(/session expired/i);
    expect(toUserMessage({ code: 'validation_error' }, 400)).toMatch(/input wasn't accepted/i);
    expect(toUserMessage({ code: 'internal_error' }, 500)).toMatch(/something went wrong on our end/i);
    expect(toUserMessage({ code: 'not_found' }, 404)).toMatch(/couldn't find that/i);
  });

  it('appends requestId for internal_error when present', () => {
    const msg = toUserMessage(
      { code: 'internal_error', requestId: 'req-abc-123' },
      500,
    );
    expect(msg).toMatch(/we've logged it/i);
    expect(msg).toContain('(id: req-abc-123)');
  });

  it('omits the requestId suffix when not provided', () => {
    const msg = toUserMessage({ code: 'internal_error' }, 500);
    expect(msg).toMatch(/we've logged it/i);
    expect(msg).not.toContain('id:');
  });

  it('returns the generic 500 message for an unknown code with status >= 500', () => {
    const msg = toUserMessage({ code: 'mystery_failure' }, 503);
    expect(msg).toBe('Something went wrong on our end. Please try again.');
  });

  it('returns the generic fallback for an unknown code with non-5xx status', () => {
    const msg = toUserMessage({ code: 'mystery_failure' }, 418);
    expect(msg).toBe("Something didn't work. Please try again.");
  });

  it('handles null / undefined payloads', () => {
    expect(toUserMessage(null, 500)).toBe('Something went wrong on our end. Please try again.');
    expect(toUserMessage(undefined, 500)).toBe('Something went wrong on our end. Please try again.');
    expect(toUserMessage(null, 418)).toBe("Something didn't work. Please try again.");
  });
});
