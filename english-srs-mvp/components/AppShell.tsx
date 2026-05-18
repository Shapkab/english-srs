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

export function AppShell({ children }: AppShellProps) {
  const [counts, setCounts] = useState<ShellCounts>({ due: null, targets: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [queueRes, targetsRes] = await Promise.all([
          fetchWithAuth('/api/v1/review-queue'),
          fetchWithAuth('/api/v1/learning-targets?count=1'),
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
      } catch {
        // ignore
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Simple, defensible streak placeholder: assume today is the only active day,
  // pad with line-soft. A real implementation would derive this from reviews.
  const streak = Array.from({ length: 14 }, (_, i) => i === 13);

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
