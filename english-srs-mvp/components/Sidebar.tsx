'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Calendar, Layers, Crosshair, Inbox, LogOut, SquarePen, Zap } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { getBrowserSupabase } from '@/lib/supabase/browser';

interface SidebarProps {
  dueCount?: number | null;
  targetCount?: number | null;
  streak?: boolean[]; // length 14, true = active past day; the final true is "today"
}

interface NavItem {
  href: Route;
  label: string;
  Icon: typeof Calendar;
  count: number | null;
}

export function Sidebar({ dueCount = null, targetCount = null, streak }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await getBrowserSupabase().auth.signOut();
    } catch {
      // Swallow — the worst case is the local session was already invalid.
      // We still redirect the user to /login on the next line.
    } finally {
      router.replace('/login' as Route);
    }
  }

  const practice: NavItem[] = [
    { href: '/dashboard' as Route, label: 'Today', Icon: Calendar, count: dueCount },
    { href: '/review' as Route, label: 'Review', Icon: Layers, count: dueCount },
    { href: '/targets' as Route, label: 'Learning targets', Icon: Crosshair, count: targetCount },
    { href: '/submissions' as Route, label: 'Submissions', Icon: Inbox, count: null },
  ];

  const capture: NavItem[] = [
    { href: '/submit' as Route, label: 'Submit text', Icon: SquarePen, count: null },
    { href: '/quick' as Route, label: 'Quick capture', Icon: Zap, count: null },
  ];

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col gap-7 border-r border-line bg-bg-elev px-5 py-7 sticky top-0 h-screen">
      <div className="flex items-center gap-2.5 px-2">
        <span className="relative inline-flex h-6 w-6 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-sage-deep/70" />
          <span className="h-2 w-2 rounded-full bg-peach-deep" />
        </span>
        <span className="font-serif text-[22px] leading-none">Plait</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">v0.1</span>
      </div>

      <NavGroup title="Practice" items={practice} pathname={pathname} />

      <NavGroup title="Capture" items={capture} pathname={pathname} />

      <div className="mt-auto flex flex-col gap-3">
        {streak && streak.length > 0 && (
          <div className="rounded-lg border border-line-soft bg-bg-card p-3.5">
            <div className="label-tiny mb-2">{streak.filter(Boolean).length}-day streak</div>
            <div className="flex gap-1">
              {streak.map((active, i) => {
                const isToday = i === streak.length - 1;
                // Today is peach only when the user actually reviewed
                // today; an inactive "today" stays line-soft so an empty
                // streak block reads as empty.
                const colorClass = isToday
                  ? active
                    ? 'bg-peach'
                    : 'bg-line-soft'
                  : active
                    ? 'bg-sage'
                    : 'bg-line-soft';
                return (
                  <span key={i} className={cn('h-[14px] w-[14px] rounded', colorClass)} />
                );
              })}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-bg-sunken hover:text-ink disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <LogOut size={16} strokeWidth={1.7} />
          <span className="flex-1 text-left">{signingOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    </aside>
  );
}

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="label-tiny px-2 mb-1.5">{title}</div>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/');
        const className = cn(
          'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
          active ? 'bg-ink text-bg-elev' : 'text-ink-soft hover:bg-bg-sunken hover:text-ink',
        );
        return (
          <Link key={it.label} href={it.href} className={className}>
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
    </div>
  );
}
