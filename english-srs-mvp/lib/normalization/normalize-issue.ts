import type { AnalysisIssueDTO, NormalizedLearningTarget } from '@/lib/types/domain';

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
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
