// Canonical-key normalization for LearningTarget dedupe.
//
// Today: NFKC + quote/whitespace canonicalization + lowercasing.
//
// Known gaps (intentional, deferred to a future PR):
//   - No lemmatization. "go" / "goes" / "went" produce distinct keys for word_form.
//   - No locale variants. "color" / "colour" produce distinct keys.
//   - No embedding-based near-duplicate dedupe.
//
// If you change this function, update tests/normalize-issue.unit.test.ts.

import type { AnalysisIssueDTO, NormalizedLearningTarget } from '@/lib/types/domain';

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIssueToLearningTarget(issue: AnalysisIssueDTO): NormalizedLearningTarget {
  const corrected = normalizeText(issue.correctedText);

  if (issue.category === 'collocation') {
    return {
      canonicalKey: `collocation:${corrected}`,
      displayTitle: corrected,
      category: issue.category,
      subcategory: issue.subcategory,
      explanationShort: issue.explanationShort,
    };
  }

  if (issue.category === 'word_form') {
    return {
      canonicalKey: `word_form:${normalizeText(issue.errorText)}>${corrected}`,
      displayTitle: corrected,
      category: issue.category,
      subcategory: issue.subcategory,
      explanationShort: issue.explanationShort,
    };
  }

  return {
    canonicalKey: `${issue.category}:${issue.subcategory ?? 'general'}:${corrected}`,
    displayTitle: corrected,
    category: issue.category,
    subcategory: issue.subcategory,
    explanationShort: issue.explanationShort,
  };
}
