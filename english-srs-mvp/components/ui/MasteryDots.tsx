import { cn } from '@/lib/ui/cn';

interface MasteryDotsProps {
  count: number;
  total?: number;
  deepClass?: string;
  className?: string;
}

export function MasteryDots({ count, total = 5, deepClass = 'bg-ink', className }: MasteryDotsProps) {
  const filled = Math.max(0, Math.min(total, count));
  return (
    <div className={cn('inline-flex items-center gap-1', className ?? '')} aria-label={`Mastery ${filled} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i < filled ? deepClass : 'bg-line',
          )}
        />
      ))}
    </div>
  );
}
