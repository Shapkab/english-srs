'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Composer } from '@/components/Composer';
import SubmissionsList from '@/components/SubmissionsList';
import { Topbar } from '@/components/Topbar';
import { LabelTiny } from '@/components/ui/LabelTiny';
import { cn } from '@/lib/ui/cn';
import { weekdayDate } from '@/lib/ui/humanize';
import { fetchWithAuth } from '@/lib/api/client';
import { getBrowserSupabase } from '@/lib/supabase/browser';

interface StatsResponse {
  activeTargets: number;
  activeTargetsDeltaWeek: number;
  masteredThisMonth: number;
  masteredDeltaPct: number;
  retention30d: number;
  retentionDelta: number;
}

const REVIEW_ROUTE = '/review' as Route;
const TARGETS_ROUTE = '/targets' as Route;

export function Dashboard() {
  const [today] = useState(() => weekdayDate());
  const [firstName, setFirstName] = useState<string>('');
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const meta = (data.session?.user.user_metadata ?? {}) as { name?: string; full_name?: string };
      const email = data.session?.user.email ?? '';
      const candidate = meta.name ?? meta.full_name ?? email.split('@')[0] ?? 'friend';
      setFirstName(candidate.split(/\s+/)[0]);
      try {
        const [queueRes, statsRes] = await Promise.all([
          fetchWithAuth('/api/v1/review-queue'),
          fetchWithAuth('/api/v1/stats'),
        ]);
        if (cancelled) return;
        if (queueRes.ok) {
          const body = (await queueRes.json()) as { cards: { cardId: string }[] };
          setDueCount(body.cards.length);
        }
        if (statsRes.ok) {
          setStats((await statsRes.json()) as StatsResponse);
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

  const subtitle = useMemo(() => {
    if (dueCount === null || firstName === '') return 'Loading your day…';
    if (dueCount === 0) {
      return "You're all caught up — submit something new to keep your queue alive.";
    }
    return `Good morning, ${firstName} — ${dueCount} ${dueCount === 1 ? 'card is' : 'cards are'} due.`;
  }, [dueCount, firstName]);

  const minutes = dueCount === null ? 0 : Math.max(1, Math.ceil((dueCount * 40) / 60));

  return (
    <main className="px-10 py-9 max-w-[1280px]">
      <Topbar
        title={today}
        subtitle={subtitle}
        actions={
          <>
            <Button variant="ghost" size="md" disabled>
              Import text
            </Button>
            <Link href="#composer">
              <Button variant="primary" size="md">
                New submission <ArrowRight size={14} strokeWidth={1.8} />
              </Button>
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 mb-9">
        <HeroReviewCard dueCount={dueCount} minutes={minutes} />
        <StatColumn stats={stats} />
      </section>

      <section id="composer" className="mb-10 scroll-mt-10">
        <Composer />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-[26px] tracking-tight">Recent submissions</h2>
          <Link href={TARGETS_ROUTE} className="text-[12px] text-ink-faint hover:text-ink">
            See all targets →
          </Link>
        </div>
        <SubmissionsList limit={10} />
      </section>
    </main>
  );
}

function HeroReviewCard({ dueCount, minutes }: { dueCount: number | null; minutes: number }) {
  const isEmpty = dueCount === 0;
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-lg border border-line bg-bg-card p-7 min-h-[260px]',
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: isEmpty
            ? 'radial-gradient(120% 80% at 0% 100%, color-mix(in oklch, var(--sage) 90%, transparent), transparent 60%)'
            : 'radial-gradient(120% 80% at 0% 100%, color-mix(in oklch, var(--sage) 80%, transparent), transparent 55%), radial-gradient(80% 60% at 100% 0%, color-mix(in oklch, var(--peach) 60%, transparent), transparent 50%)',
        }}
      />
      <div className="relative grid grid-cols-[1fr_auto] gap-5 items-end h-full">
        <div className="flex flex-col gap-4">
          <LabelTiny>Today&apos;s review</LabelTiny>
          <div className="flex items-end gap-4">
            <span className="font-serif text-[96px] leading-[0.85] tracking-tight">
              {dueCount === null ? '·' : dueCount}
            </span>
            <div className="pb-3 flex flex-col">
              <span className="font-serif text-[18px] leading-tight">
                {dueCount === 1 ? 'card due' : 'cards due'}
              </span>
              <span className="font-mono text-[11px] text-ink-faint">
                {dueCount === null ? '' : isEmpty ? 'queue empty' : `≈ ${minutes} min at your pace`}
              </span>
            </div>
          </div>
          {!isEmpty && (
            <div className="grid grid-cols-4 gap-3 max-w-[420px] pt-3">
              <Stat label="new" value="—" />
              <Stat label="learning" value="—" />
              <Stat label="review" value={dueCount === null ? '—' : String(dueCount)} />
              <Stat label="relearning" value="—" />
            </div>
          )}
        </div>
        <div className="pb-2">
          {isEmpty ? (
            <Link href={TARGETS_ROUTE}>
              <Button variant="ghost" size="lg">
                Review past targets <ArrowRight size={14} strokeWidth={1.8} />
              </Button>
            </Link>
          ) : (
            <Link href={REVIEW_ROUTE}>
              <Button variant="primary" size="lg">
                Start review <ArrowRight size={14} strokeWidth={1.8} />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[18px] text-ink tabular-nums">{value}</span>
      <span className="text-[11px] text-ink-faint">{label}</span>
    </div>
  );
}

function StatColumn({ stats }: { stats: StatsResponse | null }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <StatRow
        title="Active learning targets"
        value={stats?.activeTargets ?? null}
        chip={stats ? formatDelta(stats.activeTargetsDeltaWeek, ' wk') : null}
        chipPositive={(stats?.activeTargetsDeltaWeek ?? 0) >= 0}
      />
      <StatRow
        title="Mastered this month"
        value={stats?.masteredThisMonth ?? null}
        chip={stats ? formatPctDelta(stats.masteredDeltaPct) : null}
        chipPositive={(stats?.masteredDeltaPct ?? 0) >= 0}
      />
      <StatRow
        title="Retention (30d)"
        value={stats ? `${stats.retention30d}%` : null}
        chip={stats ? formatPctDelta(stats.retentionDelta) : null}
        chipPositive={(stats?.retentionDelta ?? 0) >= 0}
      />
    </div>
  );
}

function StatRow({
  title,
  value,
  chip,
  chipPositive,
}: {
  title: string;
  value: number | string | null;
  chip: string | null;
  chipPositive: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-4 px-5 rounded-md border border-line bg-bg-card">
      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-ink-faint">{title}</span>
        <span className="font-serif text-[28px] leading-none">{value === null ? '·' : value}</span>
      </div>
      {chip !== null && (
        <span
          className={cn(
            'font-mono text-[11px] px-2 py-0.5 rounded-full border',
            chipPositive
              ? 'bg-sage/40 text-sage-deep border-sage-deep/20'
              : 'bg-rose/40 text-rose-deep border-rose-deep/20',
          )}
        >
          {chip}
        </span>
      )}
    </div>
  );
}

function formatDelta(n: number, suffix: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±';
  return `${sign}${n}${suffix}`;
}

function formatPctDelta(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '±';
  return `${sign}${n}%`;
}
