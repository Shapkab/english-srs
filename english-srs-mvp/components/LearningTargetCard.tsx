import Link from 'next/link';
import type { Route } from 'next';
import type { IssueCategory, LearningTargetStatus } from '@/lib/types/domain';
import { CATEGORY_COLOR, CATEGORY_LABEL, isIssueCategory } from '@/lib/ui/category-color';
import { MasteryDots } from '@/components/ui/MasteryDots';
import { LabelTiny } from '@/components/ui/LabelTiny';
import { humanizeDue } from '@/lib/ui/humanize';
import { cn } from '@/lib/ui/cn';

export interface LearningTargetCardData {
  id: string;
  displayTitle: string;
  category: string;
  explanationShort: string;
  status: LearningTargetStatus;
  masteryLevel: number;
  seenCount: number;
  cardsTotal: number;
  cardsActive: number;
  nextDueAt: string | null;
}

export function LearningTargetCard({ target }: { target: LearningTargetCardData }) {
  const cat: IssueCategory = isIssueCategory(target.category) ? target.category : 'grammar';
  const color = CATEGORY_COLOR[cat];

  const isOverdue =
    target.nextDueAt !== null && new Date(target.nextDueAt).getTime() < Date.now();
  const upcoming =
    target.nextDueAt !== null && !isOverdue && new Date(target.nextDueAt).getTime() < Date.now() + 24 * 3600 * 1000;
  const dotClass = isOverdue ? 'bg-rose-deep' : upcoming ? 'bg-peach-deep' : 'bg-sage-deep';
  const nearlyMastered = target.masteryLevel >= 4;

  return (
    <Link
      href={`/targets/${target.id}` as Route}
      className={cn(
        'group relative overflow-hidden p-5 rounded-lg border border-line bg-bg-card flex flex-col gap-3.5 hover:bg-bg-elev transition-colors',
        color.cls,
      )}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: 'var(--cat-deep)' }}
        aria-hidden
      />
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: 'var(--cat-deep)' }}
          >
            {CATEGORY_LABEL[cat]}
          </span>
          <h3 className="font-serif text-[22px] leading-tight tracking-tight truncate">
            {target.displayTitle}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isOverdue && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-rose-deep">overdue</span>
          )}
          {nearlyMastered && !isOverdue && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-sage-deep">nearly mastered</span>
          )}
        </div>
      </div>

      <p className="text-[13px] text-ink-soft leading-[1.5] line-clamp-3">{target.explanationShort}</p>

      <div className="flex items-center gap-2.5">
        <LabelTiny>mastery</LabelTiny>
        <MasteryDots count={target.masteryLevel} deepClass={'bg-ink'} />
        <span className="ml-auto label-tiny">{target.seenCount} occurrences</span>
      </div>

      <div className="flex justify-between border-t border-line-soft pt-3 font-mono text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
          next review {target.nextDueAt ? humanizeDue(target.nextDueAt) : '—'}
        </span>
        <span>
          {target.cardsTotal} cards · {target.cardsActive} active
        </span>
      </div>
    </Link>
  );
}
