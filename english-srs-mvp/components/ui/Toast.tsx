'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/ui/cn';

export type ToastVariant = 'success' | 'error';

interface ToastProps {
  open: boolean;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss: () => void;
}

const TONE: Record<ToastVariant, string> = {
  success: 'bg-sage/85 text-ink border-sage-deep/30',
  error: 'bg-rose/85 text-ink border-rose-deep/30',
};

export function Toast({ open, message, variant = 'success', duration = 3000, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(handle);
  }, [open, duration, onDismiss]);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'px-4 py-2.5 rounded-lg border shadow-lift font-sans text-[13px] max-w-[90vw]',
        TONE[variant],
      )}
    >
      {message}
    </div>
  );
}
