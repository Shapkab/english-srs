import type { IssueCategory } from '@/lib/types/domain';

export interface CategoryColor {
  bg: string;
  fg: string;
  deep: string;
  cls: string;
}

export const CATEGORY_COLOR: Record<IssueCategory, CategoryColor> = {
  grammar:     { bg: 'bg-lavender', fg: 'text-lavender-deep', deep: 'lavender-deep', cls: 'cat-grammar' },
  collocation: { bg: 'bg-peach',    fg: 'text-peach-deep',    deep: 'peach-deep',    cls: 'cat-collocation' },
  word_form:   { bg: 'bg-butter',   fg: 'text-butter-deep',   deep: 'butter-deep',   cls: 'cat-word_form' },
  article:     { bg: 'bg-sage',     fg: 'text-sage-deep',     deep: 'sage-deep',     cls: 'cat-article' },
  preposition: { bg: 'bg-rose',     fg: 'text-rose-deep',     deep: 'rose-deep',     cls: 'cat-preposition' },
  tense:       { bg: 'bg-tense',    fg: 'text-tense-deep',    deep: 'tense-deep',    cls: 'cat-tense' },
  word_order:  { bg: 'bg-order',    fg: 'text-order-deep',    deep: 'order-deep',    cls: 'cat-word_order' },
  style:       { bg: 'bg-style',    fg: 'text-style-deep',    deep: 'style-deep',    cls: 'cat-style' },
};

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  grammar: 'Grammar',
  collocation: 'Collocation',
  word_form: 'Word form',
  article: 'Article',
  preposition: 'Preposition',
  tense: 'Tense',
  word_order: 'Word order',
  style: 'Style',
};

export const CATEGORY_ORDER: IssueCategory[] = [
  'grammar',
  'collocation',
  'word_form',
  'article',
  'preposition',
  'tense',
  'word_order',
  'style',
];

export function isIssueCategory(value: string): value is IssueCategory {
  return value in CATEGORY_COLOR;
}
