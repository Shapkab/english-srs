import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface TopbarProps {
  caption?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Topbar({ caption, title, subtitle, actions, className }: TopbarProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-6 mb-8', className ?? '')}>
      <div className="flex flex-col gap-2 max-w-[640px]">
        {caption && <span className="label-tiny">{caption}</span>}
        <h1 className="font-serif text-[38px] leading-none tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-soft leading-snug">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}
