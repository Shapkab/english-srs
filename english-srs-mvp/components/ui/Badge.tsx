import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export type BadgeTone =
  | 'sage'
  | 'peach'
  | 'lavender'
  | 'butter'
  | 'rose'
  | 'tense'
  | 'order'
  | 'style'
  | 'ghost';

const TONE: Record<BadgeTone, { bg: string; text: string; dot: string }> = {
  sage:     { bg: 'bg-sage/50',     text: 'text-sage-deep',     dot: 'bg-sage-deep' },
  peach:    { bg: 'bg-peach/50',    text: 'text-peach-deep',    dot: 'bg-peach-deep' },
  lavender: { bg: 'bg-lavender/50', text: 'text-lavender-deep', dot: 'bg-lavender-deep' },
  butter:   { bg: 'bg-butter/60',   text: 'text-butter-deep',   dot: 'bg-butter-deep' },
  rose:     { bg: 'bg-rose/50',     text: 'text-rose-deep',     dot: 'bg-rose-deep' },
  tense:    { bg: 'bg-tense/50',    text: 'text-tense-deep',    dot: 'bg-tense-deep' },
  order:    { bg: 'bg-order/50',    text: 'text-order-deep',    dot: 'bg-order-deep' },
  style:    { bg: 'bg-style/50',    text: 'text-style-deep',    dot: 'bg-style-deep' },
  ghost:    { bg: 'bg-bg-elev',     text: 'text-ink-soft',      dot: 'bg-ink-ghost' },
};

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'ghost', dot = true, children, className }: BadgeProps) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line/60 px-2.5 py-0.5 text-[11px] font-sans',
        t.bg,
        t.text,
        className ?? '',
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}
