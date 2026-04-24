export type IssueCategory =
  | 'grammar'
  | 'collocation'
  | 'word_form'
  | 'article'
  | 'preposition'
  | 'tense'
  | 'word_order'
  | 'style';

export type CardType = 'correction' | 'cloze' | 'choice' | 'usage';

export type SubmissionStatus = 'pending' | 'analyzed' | 'failed';
export type LearningTargetStatus = 'active' | 'mastering' | 'mastered' | 'ignored';
export type CardStatus = 'active' | 'suspended' | 'archived';

export interface AnalysisIssueDTO {
  errorText: string;
  correctedText: string;
  category: IssueCategory;
  subcategory: string | null;
  explanationShort: string;
  confidence: number;
  severity: number;
  teachability: number;
  shouldCreateCard: boolean;
}

export interface AnalysisResultDTO {
  correctedText: string;
  summary: string | null;
  issues: AnalysisIssueDTO[];
}

export interface NormalizedLearningTarget {
  canonicalKey: string;
  displayTitle: string;
  category: IssueCategory;
  subcategory: string | null;
  explanationShort: string;
}

export interface CardCandidate {
  cardType: CardType;
  front: string;
  back: string;
  hint?: string;
  example?: string;
  priority: number;
}

export interface ReviewQueueItem {
  cardId: string;
  cardType: CardType;
  front: string;
  hint: string | null;
  dueAt: string;
}
