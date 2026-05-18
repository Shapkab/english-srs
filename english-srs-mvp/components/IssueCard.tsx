import Link from 'next/link';
import type { Route } from 'next';
import type { IssueCategory } from '@/lib/types/domain';
import { CATEGORY_COLOR, CATEGORY_LABEL, isIssueCategory } from '@/lib/ui/category-color';
import { cn } from '@/lib/ui/cn';

export interface IssueCardData {
  id: string;
  index: number;
  category: string;
  subcategory: string | null;
  errorText: string;
  correctedText: string;
  explanationShort: string;
  confidence: number;
  severity: number;
  learningTarget: {
    id: string;
    title: string;
    linkKind: 'created' | 'promoted' | 'merged' | null;
    mergedOccurrences: number | null;
  } | null;
}

export function IssueCard({ issue }: { issue: IssueCardData }) {
  const cat: IssueCategory = isIssueCategory(issue.category) ? issue.category : 'grammar';
  const color = CATEGORY_COLOR[cat];
  return (
    <article
      className={cn(
        'grid grid-cols-[22px_1fr] gap-2.5 p-4 rounded border border-line bg-bg-card',
        color.cls,
      )}
    >
      <span
        className={cn(
          'h-5 w-5 rounded flex items-center justify-center font-mono text-[11px] font-semibold',
          'border',
        )}
        style={{
          background: 'color-mix(in oklch, var(--cat) 50%, transparent)',
          borderColor: 'color-mix(in oklch, var(--cat-deep) 30%, transparent)',
          color: 'var(--cat-deep)',
        }}
      >
        {issue.index}
      </span>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-semibold"
              style={{ color: 'var(--cat-deep)' }}
            >
              {CATEGORY_LABEL[cat]}
            </span>
            {issue.subcategory && (
              <span className="text-[11px] text-ink-faint truncate">· {issue.subcategory}</span>
            )}
          </div>
          <span className="font-mono text-[11px] text-ink-faint shrink-0">
            conf {issue.confidence.toFixed(2)} · sev {issue.severity}
          </span>
        </div>
        <p className="font-serif text-[17px] leading-snug">
          <span
            className="line-through"
            style={{ textDecorationColor: 'var(--cat-deep)', color: 'var(--ink-soft, #5A5048)' }}
          >
            {issue.errorText}
          </span>
          <span className="text-ink-faint mx-2">→</span>
          <span
            className="px-1 rounded-sm"
            style={{ background: 'color-mix(in oklch, var(--cat) 50%, transparent)' }}
          >
            {issue.correctedText}
          </span>
        </p>
        <p className="text-[13px] text-ink-soft leading-[1.5]">{issue.explanationShort}</p>
        {issue.learningTarget && (
          <div className="flex items-center gap-2 flex-wrap font-mono text-[12px] text-ink-faint">
            {issue.learningTarget.linkKind === 'created' && <span>Created new target</span>}
            {issue.learningTarget.linkKind === 'promoted' && <span>Promoted to existing target</span>}
            {issue.learningTarget.linkKind === 'merged' && <span>Merged with target</span>}
            <Link
              href={`/targets/${issue.learningTarget.id}` as Route}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-ink',
                issue.learningTarget.linkKind === 'created'
                  ? 'bg-sage/50 border-sage-deep/30'
                  : 'bg-bg-elev border-line',
              )}
            >
              {issue.learningTarget.title}
            </Link>
            {issue.learningTarget.mergedOccurrences && issue.learningTarget.mergedOccurrences > 1 && (
              <span className="text-sage-deep">×{issue.learningTarget.mergedOccurrences} occurrences</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
