import { describe, expect, it } from 'vitest';
import { findMarkers, type AnnotatedIssue } from '@/lib/ui/find-markers';

function issue(id: string, errorText: string): AnnotatedIssue {
  return {
    id,
    category: 'grammar',
    errorText,
    correctedText: '',
  };
}

describe('findMarkers', () => {
  it('returns no markers when issues is empty', () => {
    expect(findMarkers('some text', [])).toEqual([]);
  });

  it('returns no markers when errorText is whitespace-only', () => {
    expect(findMarkers('some text', [issue('a', '   ')])).toEqual([]);
  });

  it('skips issues whose errorText is not present in the passage', () => {
    const markers = findMarkers('The quick brown fox.', [issue('a', 'never appears')]);
    expect(markers).toEqual([]);
  });

  it('locates a single match at the correct offset', () => {
    const markers = findMarkers('The quick brown fox.', [issue('a', 'quick')]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ start: 4, end: 9, index: 1 });
    expect(markers[0].issue.id).toBe('a');
  });

  it('emits multiple markers in document order, regardless of issue order', () => {
    const text = 'fox jumps over the dog and another fox';
    // First issue targets the LATER occurrence's word; second targets earlier.
    // Even so, output should be sorted by start offset.
    const markers = findMarkers(text, [issue('a', 'dog'), issue('b', 'fox')]);
    expect(markers.map((m) => m.start)).toEqual([0, 19]);
    expect(markers.map((m) => m.issue.id)).toEqual(['b', 'a']);
  });

  it('finds duplicate errorText at two offsets — both issues get a marker', () => {
    const text = 'one foo two foo three';
    const markers = findMarkers(text, [issue('first', 'foo'), issue('second', 'foo')]);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ start: 4, end: 7 });
    expect(markers[0].issue.id).toBe('first');
    expect(markers[1]).toMatchObject({ start: 12, end: 15 });
    expect(markers[1].issue.id).toBe('second');
  });

  it('drops a later overlapping marker — keeps the earlier one', () => {
    // 'good morning' fully contains 'morning'. The longer issue at start=0
    // wins; the inner shorter issue at start=5 is dropped.
    const text = 'good morning everyone';
    const markers = findMarkers(text, [issue('a', 'good morning'), issue('b', 'morning')]);
    expect(markers).toHaveLength(1);
    expect(markers[0].issue.id).toBe('a');
  });

  it('marker index reflects original issue order (1-based)', () => {
    const text = 'alpha beta gamma';
    const markers = findMarkers(text, [
      issue('a', 'gamma'),
      issue('b', 'alpha'),
      issue('c', 'beta'),
    ]);
    expect(markers).toHaveLength(3);
    expect(markers.map((m) => m.index)).toEqual([2, 3, 1]);
  });
});
