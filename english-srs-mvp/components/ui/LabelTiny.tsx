import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface LabelTinyProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function LabelTiny({ children, className, ...rest }: LabelTinyProps) {
  return (
    <span className={cn('label-tiny', className ?? '')} {...rest}>
      {children}
    </span>
  );
}
