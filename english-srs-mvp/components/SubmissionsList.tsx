'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { fetchWithAuth } from '@/lib/api/client';
import { humanizeWhen } from '@/lib/ui/humanize';
import { cn } from '@/lib/ui/cn';

interface SubmissionRow {
  id: string;
  status: 'pending' | 'analyzed' | 'failed';
  original_text: string;
  created_at: string;
}

type Filter = 'all' | 'analyzed' | 'pending';

interface SubmissionsListProps {
  refreshKey?: number;
  limit?: number;
}

export default function SubmissionsList({ refreshKey = 0, limit = 10 }: SubmissionsListProps) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithAuth('/api/v1/submissions');
        if (!res.ok) throw new Error('Could not load submissions');
        const body = (await res.json()) as { submissions: SubmissionRow[] };
        if (!cancelled) setRows(body.submissions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const filteredRows = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
    return filteredRows.slice(0, limit);
  }, [rows, filter, limit]);

  if (error) return <p className="text-[13px] text-rose-deep">{error}</p>;

  return (
    <div>
      <FilterChips value={filter} onChange={setFilter} />
      {filtered === null ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <p className="text-center text-[13px] text-ink-faint py-10">
          No submissions yet — submit some text above.
        </p>
      ) : (
        <ul className="rounded-lg border border-line bg-bg-card overflow-hidden">
          {filtered.map((r, i) => (
            <li
              key={r.id}
              className={cn(
                'border-line-soft',
                i > 0 && 'border-t',
              )}
            >
              <Link
                href={`/submissions/${r.id}` as Route}
                className="grid grid-cols-[120px_1fr_auto] items-center gap-4 px-5 py-3.5 hover:bg-bg-elev transition-colors"
              >
                <span className="font-mono text-[11px] text-ink-faint">{humanizeWhen(r.created_at)}</span>
                <span className="truncate text-[13.5px] text-ink-soft">
                  <span className="font-serif text-ink">&ldquo;{firstClause(r.original_text)}&rdquo;</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <ArrowUpRight size={14} className="text-ink-faint" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChips({ value, onChange }: { value: Filter; onChange: (v: Filter) => void }) {
  const items: { v: Filter; label: string }[] = [
    { v: 'all', label: 'all' },
    { v: 'analyzed', label: 'analyzed' },
    { v: 'pending', label: 'pending' },
  ];
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          onClick={() => onChange(it.v)}
          className={cn(
            'rounded-full px-3 py-1 text-[12px] transition-colors',
            value === it.v
              ? 'bg-ink text-bg-elev'
              : 'text-ink-soft hover:bg-bg-elev',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: SubmissionRow['status'] }) {
  if (status === 'analyzed') return <Badge tone="sage">analyzed</Badge>;
  if (status === 'pending') return <Badge tone="butter">pending</Badge>;
  return <Badge tone="rose">failed</Badge>;
}

function Skeleton() {
  return (
    <div className="rounded-lg border border-line bg-bg-card">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-14 px-5 flex items-center',
            i > 0 && 'border-t border-line-soft',
          )}
        >
          <div className="h-3 w-full max-w-[420px] rounded bg-line-soft animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function firstClause(text: string): string {
  const stripped = text.trim().replace(/\s+/g, ' ');
  const punct = stripped.search(/[.,;!?]/);
  const cut = punct > 0 ? stripped.slice(0, Math.min(punct, 120)) : stripped.slice(0, 120);
  return cut + (stripped.length > cut.length ? '…' : '');
}
