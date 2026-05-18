'use client';

import type { Rating } from '@/lib/review/state-machine';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/ui/cn';

interface RatingRowProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
  pendingRating?: Rating | null;
  autoAdvanceMs?: number;
}

interface RatingDef {
  label: string;
  rating: Rating;
  kbd: string;
  intervalDisplay: string;
  toneClass: string;
  aria: string;
}

const BUTTONS: RatingDef[] = [
  {
    label: 'Again',
    rating: 1,
    kbd: '1',
    intervalDisplay: '< 10m  reset interval',
    toneClass: 'bg-rose/40 border-rose-deep/25 hover:bg-rose/55',
    aria: 'Again, rating 1 of 4',
  },
  {
    label: 'Hard',
    rating: 3,
    kbd: '2',
    intervalDisplay: '1d  ease −15%',
    toneClass: 'bg-peach/40 border-peach-deep/25 hover:bg-peach/55',
    aria: 'Hard, rating 2 of 4',
  },
  {
    label: 'Good',
    rating: 4,
    kbd: '3',
    intervalDisplay: '3d  on track',
    toneClass: 'bg-sage/40 border-sage-deep/25 hover:bg-sage/55',
    aria: 'Good, rating 3 of 4',
  },
  {
    label: 'Easy',
    rating: 5,
    kbd: '4',
    intervalDisplay: '1w  ease +10%',
    toneClass: 'bg-lavender/40 border-lavender-deep/25 hover:bg-lavender/55',
    aria: 'Easy, rating 4 of 4',
  },
];

export function RatingRow({ onRate, disabled, pendingRating, autoAdvanceMs }: RatingRowProps) {
  return (
    <div
      className="grid grid-cols-4 gap-3 w-full max-w-[720px]"
      role="group"
      aria-label="Rate this card"
    >
      {BUTTONS.map((b) => {
        const isPending = pendingRating === b.rating;
        return (
          <button
            key={b.rating}
            type="button"
            onClick={() => onRate(b.rating)}
            disabled={disabled}
            aria-label={b.aria}
            className={cn(
              'group relative rounded-[14px] border p-3.5 px-4 text-left transition-transform duration-75',
              'hover:-translate-y-[1px] focus-visible:-translate-y-[1px]',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              b.toneClass,
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-serif text-[22px] leading-none">{b.label}</span>
              <Kbd>{b.kbd}</Kbd>
            </div>
            <div className="mt-2 font-mono text-[12px] text-ink-faint">{b.intervalDisplay}</div>
            {isPending && autoAdvanceMs && autoAdvanceMs > 0 && (
              <span
                className="absolute inset-x-2 bottom-1.5 h-[2px] bg-ink/30 rounded-full overflow-hidden"
                aria-hidden
              >
                <span
                  className="block h-full bg-ink"
                  style={{ animation: `plait-fill ${autoAdvanceMs}ms linear forwards` }}
                />
              </span>
            )}
          </button>
        );
      })}
      <style jsx>{`
        @keyframes plait-fill {
          from { width: 0; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
