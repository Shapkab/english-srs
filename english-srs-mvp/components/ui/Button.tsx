import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-[12px] px-3 py-1.5',
  md: 'text-[13px] px-4 py-2',
  lg: 'text-[14px] px-6 py-3',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-bg-elev hover:bg-[#3a342d] disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-ink border border-line hover:bg-bg-elev disabled:opacity-50 disabled:cursor-not-allowed',
  soft:
    'bg-bg-elev text-ink hover:bg-bg-sunken border border-line-soft disabled:opacity-50 disabled:cursor-not-allowed',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-sans transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2',
        VARIANT[variant],
        SIZE[size],
        className ?? '',
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
