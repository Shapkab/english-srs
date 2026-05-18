import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/ui/cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const RADIUS: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export function Skeleton({ rounded = 'sm', className, ...rest }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn('bg-line-soft animate-pulse', RADIUS[rounded], className ?? '')}
      {...rest}
    />
  );
}
