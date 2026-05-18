import { describe, expect, it } from 'vitest';
import { computeMasteryLevel } from '@/lib/srs/mastery';

describe('computeMasteryLevel', () => {
  it('returns 0 for an empty review history', () => {
    expect(computeMasteryLevel([])).toBe(0);
  });

  it('returns 5 when all five most recent are passes', () => {
    expect(computeMasteryLevel([4, 4, 4, 4, 4])).toBe(5);
    expect(computeMasteryLevel([5, 5, 5, 5, 5])).toBe(5);
    expect(computeMasteryLevel([3, 3, 3, 3, 3])).toBe(5);
  });

  it('returns 0 when all five most recent are lapses', () => {
    expect(computeMasteryLevel([1, 1, 1, 1, 1])).toBe(0);
    expect(computeMasteryLevel([0, 2, 1, 2, 0])).toBe(0);
  });

  it('returns 3 when three of the last five are passes', () => {
    expect(computeMasteryLevel([3, 1, 4, 2, 5])).toBe(3);
    expect(computeMasteryLevel([1, 1, 3, 4, 5])).toBe(3);
  });

  it('scales linearly when fewer than five reviews exist', () => {
    expect(computeMasteryLevel([4, 5])).toBe(5);
    expect(computeMasteryLevel([3, 1])).toBe(2);
    expect(computeMasteryLevel([4])).toBe(5);
    expect(computeMasteryLevel([1])).toBe(0);
    expect(computeMasteryLevel([4, 4, 1])).toBe(3);
  });

  it('uses only the last five of the most recent ten — older reviews are ignored', () => {
    // Oldest -> newest. The newest 5 (tail) are [4,4,4,4,4]; the older
    // half is all lapses but does not influence the score.
    expect(computeMasteryLevel([1, 1, 1, 1, 1, 4, 4, 4, 4, 4])).toBe(5);
    // Newest 5 are [0,0,0,0,0]; older passes ignored.
    expect(computeMasteryLevel([5, 5, 5, 5, 5, 0, 0, 0, 0, 0])).toBe(0);
  });

  it('ignores reviews beyond the last ten entirely', () => {
    // 12 ratings: the first two (oldest) are dropped before the
    // last-five window is taken. All of those droppable values are
    // lapses, and the remaining last 5 are passes -> 5.
    expect(computeMasteryLevel([0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])).toBe(5);
  });
});
