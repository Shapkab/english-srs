import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, padded = true, elevated = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-bg-card',
        padded ? 'p-6' : '',
        elevated ? 'shadow-card' : '',
        className ?? '',
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
