'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { Button } from '@/components/ui/Button';
import { Topbar } from '@/components/Topbar';
import { LearningTargetCard, type LearningTargetCardData } from '@/components/LearningTargetCard';
import { fetchWithAuth } from '@/lib/api/client';
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER, isIssueCategory } from '@/lib/ui/category-color';
import type { IssueCategory } from '@/lib/types/domain';
import { cn } from '@/lib/ui/cn';

type SortKey = 'due' | 'mastery' | 'recent';

export function LearningTargetsLibrary() {
  const router = useRouter();
  const search = useSearchParams();
  const initialCat = search.get('cat');
  const initialSort = (search.get('sort') as SortKey | null) ?? 'due';

  const [targets, setTargets] = useState<LearningTargetCardData[] | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [activeCat, setActiveCat] = useState<IssueCategory | null>(
    initialCat && isIssueCategory(initialCat) ? initialCat : null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        params.set('sort', sort);
        if (activeCat) params.set('category', activeCat);
        const res = await fetchWithAuth(`/api/v1/learning-targets?${params.toString()}`);
        if (!res.ok) throw new Error('Could not load learning targets');
        const body = (await res.json()) as {
          targets: LearningTargetCardData[];
          categoryCounts?: Record<string, number>;
        };
        if (!cancelled) {
          setTargets(body.targets);
          setCategoryCounts(body.categoryCounts ?? {});
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sort, activeCat]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCat) params.set('cat', activeCat);
    if (sort !== 'due') params.set('sort', sort);
    const qs = params.toString();
    router.replace((qs ? `/targets?${qs}` : '/targets') as Route, { scroll: false });
  }, [router, activeCat, sort]);

  // categoryCounts come from the API and are computed over the
  // unfiltered (status-only) set, so the chip counts stay correct
  // when a category filter is active.
  const allCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  return (
    <main className="px-10 py-9 max-w-[1280px]">
      <Topbar
        title="Learning targets"
        subtitle="The patterns English SRS is tracking for you — derived from your own writing, not a fixed syllabus."
        actions={
          <>
            <Button variant="ghost" disabled>Export</Button>
            <Button variant="primary" disabled>+ Manual target</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Chip
          active={activeCat === null}
          onClick={() => setActiveCat(null)}
          count={targets === null ? null : allCount}
        >
          All
        </Chip>
        {CATEGORY_ORDER.map((cat) => (
          <Chip
            key={cat}
            active={activeCat === cat}
            onClick={() => setActiveCat((c) => (c === cat ? null : cat))}
            catClass={CATEGORY_COLOR[cat].cls}
            count={targets === null ? null : categoryCounts[cat] ?? 0}
          >
            {CATEGORY_LABEL[cat]}
          </Chip>
        ))}
        <div className="ml-auto">
          <SortChip value={sort} onChange={setSort} />
        </div>
      </div>

      {error && <p className="text-[13px] text-rose-deep">{error}</p>}

      {targets === null ? (
        <Skeleton />
      ) : targets.length === 0 ? (
        <div className="rounded-lg border border-line bg-bg-card p-12 text-center">
          <p className="text-[13px] text-ink-faint">
            No learning targets yet. Submit some text and English SRS will surface the patterns it sees.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {targets.map((t) => (
            <LearningTargetCard key={t.id} target={t} />
          ))}
        </div>
      )}
    </main>
  );
}

function Chip({
  active,
  onClick,
  catClass,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  catClass?: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] transition-colors',
        active
          ? 'bg-ink text-bg-elev border-ink'
          : 'bg-bg-card border-line text-ink-soft hover:bg-bg-elev',
        catClass ?? '',
      )}
    >
      {catClass && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: 'var(--cat-deep)' }}
          aria-hidden
        />
      )}
      <span>{children}</span>
      {count !== null && (
        <span className={cn('font-mono text-[11px]', active ? 'text-bg-elev/70' : 'text-ink-faint')}>
          {count}
        </span>
      )}
    </button>
  );
}

function SortChip({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const NEXT: Record<SortKey, SortKey> = { due: 'mastery', mastery: 'recent', recent: 'due' };
  const labels: Record<SortKey, string> = {
    due: 'Sort: due first',
    mastery: 'Sort: mastery asc',
    recent: 'Sort: recent',
  };
  return (
    <button
      type="button"
      onClick={() => onChange(NEXT[value])}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line bg-bg-card text-[12px] text-ink-soft hover:bg-bg-elev"
    >
      {labels[value]}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[180px] rounded-lg bg-line-soft animate-pulse" />
      ))}
    </div>
  );
}
