import { describe, expect, it } from 'vitest';
import { computeLinkKind } from '@/lib/ui/link-kind';

const SUBMISSION = '2026-05-10T12:00:00.000Z';
const BEFORE = '2026-04-01T00:00:00.000Z';
const AFTER = '2026-05-10T12:00:00.001Z';

describe('computeLinkKind', () => {
  it('returns null when input is null/undefined', () => {
    expect(computeLinkKind(null)).toBeNull();
    expect(computeLinkKind(undefined)).toBeNull();
  });

  it('classifies "created" when firstSeenAt is at or after the submission', () => {
    expect(
      computeLinkKind({ firstSeenAt: SUBMISSION, submissionCreatedAt: SUBMISSION, seenCount: 1 }),
    ).toBe('created');
    expect(
      computeLinkKind({ firstSeenAt: AFTER, submissionCreatedAt: SUBMISSION, seenCount: 1 }),
    ).toBe('created');
    // seenCount is irrelevant when isNew is true (a fresh LT can still
    // have an inflated seen_count if backfill ran).
    expect(
      computeLinkKind({ firstSeenAt: AFTER, submissionCreatedAt: SUBMISSION, seenCount: 7 }),
    ).toBe('created');
  });

  it('classifies "merged" when LT predates the submission and seenCount > 1', () => {
    expect(
      computeLinkKind({ firstSeenAt: BEFORE, submissionCreatedAt: SUBMISSION, seenCount: 2 }),
    ).toBe('merged');
    expect(
      computeLinkKind({ firstSeenAt: BEFORE, submissionCreatedAt: SUBMISSION, seenCount: 42 }),
    ).toBe('merged');
  });

  it('classifies "promoted" when LT predates the submission and seenCount == 1', () => {
    expect(
      computeLinkKind({ firstSeenAt: BEFORE, submissionCreatedAt: SUBMISSION, seenCount: 1 }),
    ).toBe('promoted');
  });

  it('classifies "promoted" when seenCount is 0 (defensive)', () => {
    expect(
      computeLinkKind({ firstSeenAt: BEFORE, submissionCreatedAt: SUBMISSION, seenCount: 0 }),
    ).toBe('promoted');
  });
});
