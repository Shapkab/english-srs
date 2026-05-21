'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Calendar, Crosshair, Layers, Menu, X, SquarePen, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';

interface MobileNavProps {
  dueCount?: number | null;
  targetCount?: number | null;
}

interface NavItem {
  href: Route;
  label: string;
  Icon: typeof Calendar;
  count: number | null;
}

export function MobileNav({ dueCount = null, targetCount = null }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open; focus the close button on open; restore
  // focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  // Esc to close + simple focus trap (cycle Tab within drawer).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = drawerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const items: NavItem[] = [
    { href: '/dashboard' as Route, label: 'Today', Icon: Calendar, count: dueCount },
    { href: '/review' as Route, label: 'Review', Icon: Layers, count: dueCount },
    { href: '/targets' as Route, label: 'Learning targets', Icon: Crosshair, count: targetCount },
  ];

  const captureItems: NavItem[] = [
    { href: '/submit' as Route, label: 'Submit text', Icon: SquarePen, count: null },
    { href: '/quick' as Route, label: 'Quick capture', Icon: Zap, count: null },
  ];

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg-elev px-4 py-3">
        <Link href={'/dashboard' as Route} className="flex items-center gap-2">
          <span className="relative inline-flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-sage-deep/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-peach-deep" />
          </span>
          <span className="font-serif text-[18px] leading-none">Plait</span>
        </Link>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-bg-card text-ink-soft hover:text-ink"
        >
          <Menu size={16} strokeWidth={1.7} />
        </button>
      </header>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-ink/30"
          aria-hidden
          onClick={close}
        />
      )}

      <div
        ref={drawerRef}
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'md:hidden fixed top-0 right-0 z-50 h-full w-[280px] max-w-[85vw] bg-bg-elev border-l border-line shadow-lift',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
          <span className="font-serif text-[20px] leading-none">Plait</span>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-bg-card text-ink-soft hover:text-ink"
          >
            <X size={16} strokeWidth={1.7} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          <div className="label-tiny px-2 mb-1.5">Practice</div>
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + '/');
            return (
              <Link
                key={it.label}
                href={it.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] transition-colors',
                  active ? 'bg-ink text-bg-elev' : 'text-ink-soft hover:bg-bg-sunken hover:text-ink',
                )}
              >
                <it.Icon size={16} strokeWidth={1.7} />
                <span className="flex-1">{it.label}</span>
                {it.count !== null && (
                  <span className={cn('font-mono text-[11px]', active ? 'text-bg-elev/70' : 'text-ink-faint')}>
                    {it.count}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="label-tiny px-2 mb-1.5 mt-4">Capture</div>
          {captureItems.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + '/');
            return (
              <Link
                key={it.label}
                href={it.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] transition-colors',
                  active ? 'bg-ink text-bg-elev' : 'text-ink-soft hover:bg-bg-sunken hover:text-ink',
                )}
              >
                <it.Icon size={16} strokeWidth={1.7} />
                <span className="flex-1">{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
