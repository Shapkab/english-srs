'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { Sidebar } from '@/components/Sidebar';
import { fetchWithAuth } from '@/lib/api/client';

interface AppShellProps {
  children: ReactNode;
}

interface ShellCounts {
  due: number | null;
  targets: number | null;
}

// Length 14; the final entry is "today" (peach in Sidebar). All-false
// keeps the streak block visible but greyed-out for users with no
// history.
const EMPTY_STREAK: boolean[] = Array.from({ length: 14 }, () => false);

export function AppShell({ children }: AppShellProps) {
  const [counts, setCounts] = useState<ShellCounts>({ due: null, targets: null });
  const [streak, setStreak] = useState<boolean[]>(EMPTY_STREAK);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [queueRes, targetsRes, statsRes] = await Promise.all([
          fetchWithAuth('/api/v1/review-queue'),
          fetchWithAuth('/api/v1/learning-targets?count=1'),
          fetchWithAuth('/api/v1/stats'),
        ]);
        if (cancelled) return;
        if (queueRes.ok) {
          const body = (await queueRes.json()) as { cards: unknown[] };
          setCounts((c) => ({ ...c, due: body.cards.length }));
        }
        if (targetsRes.ok) {
          const body = (await targetsRes.json()) as { total: number };
          setCounts((c) => ({ ...c, targets: body.total }));
        }
        if (statsRes.ok) {
          const body = (await statsRes.json()) as { streak?: boolean[] };
          if (Array.isArray(body.streak) && body.streak.length === 14) {
            setStreak(body.streak);
          }
        }
      } catch {
        // ignore — the shell stays usable without these numbers
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthGate>
      <div className="flex min-h-screen bg-bg">
        <Sidebar
          dueCount={counts.due}
          targetCount={counts.targets}
          streak={streak}
        />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </AuthGate>
  );
}
