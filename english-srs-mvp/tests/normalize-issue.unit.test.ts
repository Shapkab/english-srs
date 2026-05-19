import { describe, expect, it } from 'vitest';
import { normalizeIssueToLearningTarget } from '@/lib/normalization/normalize-issue';
import type { AnalysisIssueDTO, IssueCategory } from '@/lib/types/domain';

function makeIssue(overrides: Partial<AnalysisIssueDTO> & { category: IssueCategory }): AnalysisIssueDTO {
  return {
    errorText: '',
    correctedText: '',
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

// Adversarial canonicalization: Unicode / quote / whitespace inputs that
// should produce the same canonical key as their straight-quote /
// single-spaced / precomposed-Unicode counterparts.
//
// Inputs are constructed via explicit \uXXXX escapes (rather than literal
// characters) so the byte sequence is unambiguous and editor/source-encoding
// quirks can't accidentally mask whether NFKC/quote/whitespace
// canonicalization is actually running.
describe('normalizeIssueToLearningTarget — adversarial canonicalization', () => {
  it("smart-quote input ('don’t' with U+2019) collapses to the same key as straight-quote (don't)", () => {
    const smart = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'don’t' }),
    );
    const straight = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: "don't" }),
    );
    expect(smart.canonicalKey).toBe(straight.canonicalKey);
    expect(smart.canonicalKey).toBe("collocation:don't");
  });

  it('trailing/leading whitespace produces the same key as the trimmed form', () => {
    const padded = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: '  go to home  ' }),
    );
    const tight = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'go to home' }),
    );
    expect(padded.canonicalKey).toBe(tight.canonicalKey);
    expect(padded.canonicalKey).toBe('collocation:go to home');
  });

  it('multiple internal spaces collapse to a single space', () => {
    const doubled = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'go  to    home' }),
    );
    expect(doubled.canonicalKey).toBe('collocation:go to home');
  });

  it('NFKC-decomposed Unicode (e + combining acute U+0301) collapses to the precomposed (U+00E9) form', () => {
    const decomposedInput = 'café'; // e + U+0301 combining acute
    const precomposedInput = 'café'; // U+00E9 latin small letter e with acute
    expect(decomposedInput).not.toBe(precomposedInput); // sanity: distinct byte sequences

    const decomposed = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: decomposedInput }),
    );
    const precomposed = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: precomposedInput }),
    );
    expect(decomposed.canonicalKey).toBe(precomposed.canonicalKey);
    expect(decomposed.canonicalKey).toBe('collocation:café');
  });

  it('en/em dash (U+2013, U+2014) collapse to a hyphen-minus (U+002D)', () => {
    const en = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'state–of–the–art' }),
    );
    const em = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'state—of—the—art' }),
    );
    const hyphen = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'state-of-the-art' }),
    );
    expect(en.canonicalKey).toBe(hyphen.canonicalKey);
    expect(em.canonicalKey).toBe(hyphen.canonicalKey);
  });

  it('non-breaking space (U+00A0) collapses to the same key as a regular space', () => {
    const nbsp = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'go to home' }),
    );
    const regular = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'go to home' }),
    );
    expect(nbsp.canonicalKey).toBe(regular.canonicalKey);
  });
});


describe('unicode edge cases (E9)', () => {
  it('removes zero-width characters from canonicalKey', () => {
    const out = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'test\u200Bword' }),
    );
    expect(out.canonicalKey).not.toContain('\u200B');
    expect(out.canonicalKey).toBe('collocation:testword');
  });

  it('removes control characters', () => {
    const out = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'test\u0000word' }),
    );
    expect(out.canonicalKey).not.toContain('\u0000');
    expect(out.canonicalKey).toBe('collocation:testword');
  });

  it('normalizes non-breaking space to a regular space in displayTitle', () => {
    const out = normalizeIssueToLearningTarget(
      makeIssue({ category: 'collocation', correctedText: 'test\u00A0word' }),
    );
    expect(out.displayTitle).toBe('test word');
  });
});
