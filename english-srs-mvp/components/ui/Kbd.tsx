import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('kbd', className ?? '')}>{children}</kbd>;
}
