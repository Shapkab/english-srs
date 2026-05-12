import { describe, expect, it } from 'vitest';
import { normalizeIssueToLearningTarget } from '@/lib/normalization/normalize-issue';
import type { AnalysisIssueDTO, IssueCategory } from '@/lib/types/domain';

function makeIssue(overrides: Partial<AnalysisIssueDTO> & { category: IssueCategory }): AnalysisIssueDTO {
  return {
    errorText: '',
    correctedText: '',
    category: overrides.category,
    subcategory: null,
    explanationShort: 'short explanation',
    confidence: 0.9,
    severity: 3,
    teachability: 3,
    shouldCreateCard: true,
    ...overrides,
  };
}

describe('normalizeIssueToLearningTarget — locked current behavior', () => {
  describe('collocation category', () => {
    it('produces collocation:<lowercased-trimmed-correctedText>', () => {
      const out = normalizeIssueToLearningTarget(
        makeIssue({ category: 'collocation', correctedText: '  Make A Decision  ' }),
      );
      expect(out.canonicalKey).toBe('collocation:make a decision');
      expect(out.displayTitle).toBe('make a decision');
    });

    it('preserves category + subcategory + explanationShort fields verbatim', () => {
      const out = normalizeIssueToLearningTarget(
        makeIssue({
          category: 'collocation',
          correctedText: 'do homework',
          subcategory: 'verb-noun',
          explanationShort: 'verb-noun pair',
        }),
      );
      expect(out.category).toBe('collocation');
      expect(out.subcategory).toBe('verb-noun');
      expect(out.explanationShort).toBe('verb-noun pair');
    });
  });

  describe('word_form category', () => {
    it('produces word_form:<lowercased-error>><lowercased-corrected>', () => {
      const out = normalizeIssueToLearningTarget(
        makeIssue({
          category: 'word_form',
          errorText: 'Goed',
          correctedText: 'Went',
        }),
      );
      expect(out.canonicalKey).toBe('word_form:goed>went');
      expect(out.displayTitle).toBe('went');
    });

    it('trims both sides of the error>corrected key independently', () => {
      const out = normalizeIssueToLearningTarget(
        makeIssue({
          category: 'word_form',
          errorText: '  Goed  ',
          correctedText: '  Went  ',
        }),
      );
      expect(out.canonicalKey).toBe('word_form:goed>went');
    });
  });

  describe('other categories', () => {
    it('produces <category>:<subcategory>:<corrected> when subcategory is set', () => {
      const out = normalizeIssueToLearningTarget(
        makeIssue({
          category: 'tense',
          subcategory: 'past simple',
          correctedText: 'I Went',
        }),
      );
      expect(out.canonicalKey).toBe('tense:past simple:i went');
    });

    it("falls back to <category>:general:<corrected> when subcategory is null", () => {
      const out = normalizeIssueToLearningTarget(
        makeIssue({ category: 'grammar', correctedText: 'an apple', subcategory: null }),
      );
      expect(out.canonicalKey).toBe('grammar:general:an apple');
    });

    it.each(['article', 'preposition', 'word_order', 'style'] as const)(
      'category=%s also uses the same general/subcategory pattern',
      (category) => {
        const out = normalizeIssueToLearningTarget(
          makeIssue({ category, correctedText: 'sample text', subcategory: null }),
        );
        expect(out.canonicalKey).toBe(`${category}:general:sample text`);
      },
    );
  });
});

// These cases fail today and will pass after Phase δ implements NFKC + quote
// + whitespace canonicalization. They live here as it.todo so the file
// documents the planned behavior and Phase δ can flip them to live it() with
// no scaffolding work.
describe('normalizeIssueToLearningTarget — adversarial canonicalization (Phase δ targets)', () => {
  it.todo("smart-quote input ('don’t' with U+2019) collapses to the same key as straight-quote ('don\\'t')");

  it.todo('trailing/leading whitespace produces the same key as the trimmed form');

  it.todo('multiple internal spaces collapse to a single space');

  it.todo('NFKC-decomposed Unicode (e.g. e + combining acute U+0301) collapses to the precomposed (é) form');
});
