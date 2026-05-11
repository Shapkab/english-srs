import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSrsState } from '@/lib/srs/update-srs';

const ORIGINAL_TZ = process.env.TZ;

describe('updateSrsState — DST-safe UTC arithmetic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  const cases: Array<{ tz: string; nowIso: string; label: string }> = [
    // March 9, 2025 18:00 UTC is the morning before US spring-forward (Sunday 02:00 PT).
    // A +1d add must produce exactly 86,400,000 ms later, not 82,800,000 (-1h) or 90,000,000 (+1h).
    { tz: 'America/Los_Angeles', nowIso: '2025-03-09T05:00:00.000Z', label: 'LA spring-forward' },
    // October 26, 2025 00:30 UTC is the morning before Europe/Berlin fall-back (Sunday 03:00 → 02:00 local).
    { tz: 'Europe/Berlin',       nowIso: '2025-10-26T00:30:00.000Z', label: 'Berlin fall-back' },
    // UTC baseline.
    { tz: 'UTC',                 nowIso: '2025-06-15T12:00:00.000Z', label: 'UTC baseline' },
    // Non-DST tz crossing 0–1 hour window.
    { tz: 'Asia/Tokyo',          nowIso: '2025-03-09T15:00:00.000Z', label: 'Tokyo (no DST)' },
  ];

  for (const tc of cases) {
    it(`returns dueAt exactly intervalDays*86_400_000 ms after now in ${tc.label}`, () => {
      process.env.TZ = tc.tz;
      const fakeNow = new Date(tc.nowIso);
      vi.setSystemTime(fakeNow);

      const result = updateSrsState(
        { repetition: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0 },
        4,
      );

      // rating >= 3 with repetition=0 → intervalDays becomes 1.
      expect(result.intervalDays).toBe(1);

      const expectedDueMs = fakeNow.getTime() + 1 * 86_400_000;
      const actualDueMs = new Date(result.dueAt).getTime();
      expect(actualDueMs - fakeNow.getTime()).toBe(86_400_000);
      expect(actualDueMs).toBe(expectedDueMs);
    });
  }

  it('multi-day intervals also remain exact under non-UTC TZ', () => {
    process.env.TZ = 'America/Los_Angeles';
    const fakeNow = new Date('2025-03-09T05:00:00.000Z');
    vi.setSystemTime(fakeNow);

    // repetition=2 + good rating triggers Math.round(intervalDays * easeFactor).
    const result = updateSrsState(
      { repetition: 2, intervalDays: 6, easeFactor: 2.5, lapseCount: 0 },
      5,
    );

    const expectedDueMs = fakeNow.getTime() + result.intervalDays * 86_400_000;
    const actualDueMs = new Date(result.dueAt).getTime();
    expect(actualDueMs).toBe(expectedDueMs);
  });
});
