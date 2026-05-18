import type { IssueCategory } from '@/lib/types/domain';
import { CATEGORY_COLOR, isIssueCategory } from '@/lib/ui/category-color';
import { MasteryDots } from '@/components/ui/MasteryDots';
import { cn } from '@/lib/ui/cn';

interface LearningTargetMiniProps {
  title: string;
  category: string;
  seenCount: number;
  masteryLevel: number;
}

export function LearningTargetMini({ title, category, seenCount, masteryLevel }: LearningTargetMiniProps) {
  const cat: IssueCategory = isIssueCategory(category) ? category : 'grammar';
  const color = CATEGORY_COLOR[cat];
  return (
    <div className={cn('grid grid-cols-[28px_1fr_auto] items-center gap-3 p-3.5 px-4 rounded border border-line bg-bg-card', color.cls)}>
      <span
        className="h-7 w-7 rounded"
        style={{ background: 'var(--cat)' }}
        aria-hidden
      />
      <div className="flex flex-col min-w-0">
        <span className="font-serif text-[17px] leading-tight truncate">{title}</span>
        <span className="font-mono text-[11px] text-ink-faint">
          seen {seenCount} times · mastery {masteryLevel}/5
        </span>
      </div>
      <MasteryDots count={masteryLevel} deepClass="bg-ink" />
    </div>
  );
}
