'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { use, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Topbar } from '@/components/Topbar';
import { Badge } from '@/components/ui/Badge';
import { LabelTiny } from '@/components/ui/LabelTiny';
import { fetchWithAuth } from '@/lib/api/client';
import { humanizeWhen } from '@/lib/ui/humanize';

interface TargetDetailResponse {
  target: {
    id: string;
    canonicalKey: string;
    displayTitle: string;
    category: string;
    subcategory: string | null;
    explanationShort: string;
    seenCount: number;
    lastSeenAt: string | null;
    status: 'active' | 'mastering' | 'mastered' | 'ignored';
    mergedIntoId: string | null;
  };
  cards: Array<{
    cardId: string;
    cardType: string;
    front: string;
    back: string;
    hint: string | null;
    status: 'active' | 'suspended';
    priority: number;
    createdAt: string;
    srs: {
      repetition: number;
      intervalDays: number;
      easeFactor: number;
      dueAt: string;
      lapseCount: number;
      lastReviewedAt: string | null;
    } | null;
  }>;
  evidence: Array<{
    id: string;
    analysisIssueId: string;
    submissionId: string;
    createdAt: string;
  }>;
}

export default function TargetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<TargetDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/v1/learning-targets/${id}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          if (!cancelled) {
            setError(body.code === 'not_found' ? 'Target not found.' : 'Could not load target.');
          }
          return;
        }
        const body = (await res.json()) as TargetDetailResponse;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setError('Could not load target.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="px-10 py-9 max-w-[1280px]">
        <Topbar
          caption="Learning target"
          title="Unavailable"
          subtitle={error}
          actions={
            <Link href={'/targets' as Route}>
              <Button variant="ghost">← All targets</Button>
            </Link>
          }
        />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="px-10 py-9 max-w-[1280px]">
        <Topbar caption="Learning target" title="Loading…" />
      </main>
    );
  }

  const { target, cards, evidence } = data;

  return (
    <main className="px-10 py-9 max-w-[1280px]">
      <Topbar
        caption={target.category + (target.subcategory ? ` · ${target.subcategory}` : '')}
        title={target.displayTitle}
        subtitle={target.explanationShort}
        actions={
          <Link href={'/targets' as Route}>
            <Button variant="ghost">← All targets</Button>
          </Link>
        }
      />

      {target.mergedIntoId && (
        <div className="mb-6 rounded-lg border border-line-soft bg-bg-card p-4">
          <p className="text-[13px] text-ink-soft">
            This target was merged into another — its cards now live there.{' '}
            <Link
              href={`/targets/${target.mergedIntoId}` as Route}
              className="text-ink underline"
            >
              Open the survivor →
            </Link>
          </p>
        </div>
      )}

      <section className="mb-8 grid grid-cols-3 gap-4 max-w-[640px]">
        <div className="rounded-lg border border-line-soft bg-bg-card p-4">
          <LabelTiny>Status</LabelTiny>
          <div className="mt-2"><Badge tone="ghost">{target.status}</Badge></div>
        </div>
        <div className="rounded-lg border border-line-soft bg-bg-card p-4">
          <LabelTiny>Seen</LabelTiny>
          <div className="mt-2 font-serif text-[24px] leading-none">{target.seenCount}</div>
        </div>
        <div className="rounded-lg border border-line-soft bg-bg-card p-4">
          <LabelTiny>Last seen</LabelTiny>
          <div className="mt-2 text-[13px] text-ink-soft">
            {target.lastSeenAt ? humanizeWhen(target.lastSeenAt) : '—'}
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="font-serif text-[22px] leading-tight mb-3">Cards</h2>
        {cards.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No cards have been generated for this target yet.</p>
        ) : (
          <ul className="grid gap-3">
            {cards.map((card) => (
              <li
                key={card.cardId}
                className="rounded-lg border border-line-soft bg-bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Badge tone="ghost">{card.cardType}</Badge>
                  <Badge tone={card.status === 'active' ? 'sage' : 'rose'}>{card.status}</Badge>
                </div>
                <p className="font-serif text-[16px] mb-1">{card.front}</p>
                <p className="text-[13px] text-ink-soft mb-2">{card.back}</p>
                {card.srs && (
                  <p className="font-mono text-[11px] text-ink-faint">
                    rep {card.srs.repetition} · ease {card.srs.easeFactor.toFixed(2)} · lapses{' '}
                    {card.srs.lapseCount} · due {humanizeWhen(card.srs.dueAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-[22px] leading-tight mb-3">Evidence</h2>
        {evidence.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No evidence rows yet.</p>
        ) : (
          <ul className="grid gap-2">
            {evidence.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-bg-card px-4 py-3"
              >
                <Link
                  href={`/submissions/${ev.submissionId}` as Route}
                  className="text-[13px] text-ink underline"
                >
                  Submission {ev.submissionId.slice(0, 8)}…
                </Link>
                <span className="font-mono text-[11px] text-ink-faint">
                  {humanizeWhen(ev.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
