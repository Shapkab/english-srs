'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabelTiny } from '@/components/ui/LabelTiny';
import { Badge } from '@/components/ui/Badge';
import { Topbar } from '@/components/Topbar';
import { AnnotatedPassage, type AnnotatedIssue } from '@/components/IssueAnnotation';
import { IssueCard, type IssueCardData } from '@/components/IssueCard';
import { LearningTargetMini } from '@/components/LearningTargetMini';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { humanizeWhen } from '@/lib/ui/humanize';
import { CATEGORY_COLOR, isIssueCategory } from '@/lib/ui/category-color';
import type { IssueCategory } from '@/lib/types/domain';
import { cn } from '@/lib/ui/cn';

interface AnalysisIssue {
  id: string;
  category: string;
  subcategory: string | null;
  errorText: string;
  correctedText: string;
  explanationShort: string;
  confidence: number;
  severity: number;
  shouldCreateCard: boolean;
  learningTarget: {
    id: string;
    title: string;
    category: string;
    masteryLevel: number;
    seenCount: number;
    linkKind: 'created' | 'promoted' | 'merged' | null;
    mergedOccurrences: number | null;
  } | null;
}

interface CardCreated {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  cardType: string;
  status: string;
  learningTargetId: string | null;
  learningTarget: {
    id: string;
    title: string;
    category: string;
  } | null;
}

interface AnalysisResponse {
  status: 'pending' | 'analyzed' | 'failed';
  failureReason: string | null;
  originalText: string;
  createdAt: string;
  correctedText: string | null;
  summary: string | null;
  issues: AnalysisIssue[];
  cardsCreated: CardCreated[];
}

const DASHBOARD_ROUTE = '/dashboard' as Route;
const REVIEW_ROUTE = '/review' as Route;

export function SubmissionDetail({ id }: { id: string }) {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function poll() {
      try {
        const res = await fetchWithAuth(`/api/v1/submissions/${id}/analysis`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ErrorPayload;
          throw new Error(toUserMessage(body, res.status));
        }
        const body = (await res.json()) as AnalysisResponse;
        if (cancelled) return;
        setAnalysis(body);
        const isTerminal = body.status === 'analyzed' || body.status === 'failed';
        if (isTerminal && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      }
    }
    void poll();
    timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [id]);

  const headline = useMemo(() => {
    const text = analysis?.originalText ?? '';
    const trim = text.trim().replace(/\s+/g, ' ');
    const punct = trim.search(/[.!?]/);
    const cut = punct > 0 ? trim.slice(0, Math.min(punct, 100)) : trim.slice(0, 100);
    if (cut.length === 0) return 'Submission';
    return `"${cut}${trim.length > cut.length ? '…' : ''}"`;
  }, [analysis?.originalText]);

  const targets = useMemo(() => {
    if (!analysis) return [];
    const seen = new Map<string, AnalysisIssue['learningTarget']>();
    for (const issue of analysis.issues) {
      const lt = issue.learningTarget;
      if (lt && !seen.has(lt.id)) seen.set(lt.id, lt);
    }
    return Array.from(seen.values()).filter((v): v is NonNullable<typeof v> => v !== null);
  }, [analysis]);

  async function onReanalyze() {
    if (!analysis) return;
    setError(null);
    setRetrying(true);
    try {
      const res = await fetchWithAuth(`/api/dev/process-submission/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error('Re-analyze failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  }

  if (error && !analysis) {
    return (
      <main className="px-10 py-9 max-w-[1280px]">
        <div className="rounded-lg border border-line bg-bg-card p-8 text-center">
          <h2 className="font-serif text-[24px] mb-2">Something went wrong</h2>
          <p className="text-[13px] text-ink-soft">{error}</p>
        </div>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main className="px-10 py-9 max-w-[1280px]">
        <div className="h-8 w-32 rounded bg-line-soft animate-pulse mb-4" />
        <div className="h-12 w-2/3 rounded bg-line-soft animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="h-[300px] rounded-lg bg-line-soft animate-pulse" />
          <div className="h-[300px] rounded-lg bg-line-soft animate-pulse" />
        </div>
      </main>
    );
  }

  if (analysis.status === 'failed') {
    return (
      <main className="px-10 py-9 max-w-[1280px]">
        <Topbar
          caption={`Submission · ${humanizeWhen(analysis.createdAt)}`}
          title={headline}
          subtitle="This submission couldn't be analyzed."
          actions={
            <Link href={DASHBOARD_ROUTE}>
              <Button variant="ghost">← Back to dashboard</Button>
            </Link>
          }
        />
        <div className="rounded-lg border border-rose-deep/30 bg-rose/30 p-6">
          <h3 className="font-serif text-[20px] mb-2">Analysis failed</h3>
          <p className="text-[13px] text-ink-soft mb-4">
            {analysis.failureReason ?? "We don't have a specific reason logged."}
          </p>
          <Button variant="primary" onClick={onReanalyze} disabled={retrying}>
            <RotateCw size={14} strokeWidth={1.8} /> {retrying ? 'Re-analyzing…' : 'Re-analyze'}
          </Button>
        </div>
      </main>
    );
  }

  if (analysis.status === 'pending' || analysis.correctedText === null) {
    return (
      <main className="px-10 py-9 max-w-[1280px]">
        <Topbar
          caption={`Submission · ${humanizeWhen(analysis.createdAt)}`}
          title={headline}
          subtitle="Analyzing… this page refreshes every 2 seconds."
        />
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="rounded-lg border border-line bg-bg-card p-6">
            <LabelTiny>Original</LabelTiny>
            <p className="font-serif text-[24px] leading-[1.6] mt-3 whitespace-pre-wrap">
              {analysis.originalText}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-bg-card p-10 text-center">
            <div className="inline-block h-6 w-6 rounded-full border-2 border-sage-deep border-t-transparent animate-spin mb-3" />
            <p className="text-[13px] text-ink-soft">Analyzing…</p>
          </div>
        </div>
      </main>
    );
  }

  // analyzed
  const paragraphs = analysis.originalText.split(/\n+/).filter((p) => p.trim().length > 0);
  const wordCount = analysis.originalText.trim().split(/\s+/).filter(Boolean).length;

  return (
    <main className="px-10 py-9 max-w-[1280px]">
      <Topbar
        caption={`Submission · ${humanizeWhen(analysis.createdAt)}`}
        title={headline}
        subtitle={`${analysis.issues.length} ${analysis.issues.length === 1 ? 'issue' : 'issues'} found · ${targets.length} learning ${targets.length === 1 ? 'target' : 'targets'} affected · ${analysis.cardsCreated.length} new ${analysis.cardsCreated.length === 1 ? 'card' : 'cards'} scheduled`}
        actions={
          <>
            <Button variant="ghost" onClick={onReanalyze} disabled={retrying}>
              <RotateCw size={14} strokeWidth={1.8} /> {retrying ? 'Re-analyzing…' : 'Re-analyze'}
            </Button>
            <Link href={`${REVIEW_ROUTE}?submission=${id}` as Route}>
              <Button variant="primary">
                Start review of these <ArrowRight size={14} strokeWidth={1.8} />
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-6 min-w-0">
          <section className="rounded-lg border border-line bg-bg-card p-7">
            <div className="flex items-baseline gap-2 mb-3">
              <LabelTiny>Original</LabelTiny>
              <span className="font-mono text-[11px] text-ink-faint">
                · {paragraphs.length} {paragraphs.length === 1 ? 'paragraph' : 'paragraphs'} · {wordCount} words
              </span>
            </div>
            <AnnotatedPassage
              text={analysis.originalText}
              issues={analysis.issues.map((issue) => ({
                id: issue.id,
                category: (isIssueCategory(issue.category) ? issue.category : 'grammar') as IssueCategory,
                errorText: issue.errorText,
                correctedText: issue.correctedText,
              }) satisfies AnnotatedIssue)}
            />
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-[22px]">Issues</h2>
              <span className="text-[12px] text-ink-faint">Each issue links to a learning target.</span>
            </div>
            {analysis.issues.length === 0 ? (
              <div className="rounded-lg border border-line bg-bg-card p-8 text-center text-[13px] text-ink-faint">
                No issues found — nice writing.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {analysis.issues.map((issue, i) => {
                  const data: IssueCardData = {
                    id: issue.id,
                    index: i + 1,
                    category: issue.category,
                    subcategory: issue.subcategory,
                    errorText: issue.errorText,
                    correctedText: issue.correctedText,
                    explanationShort: issue.explanationShort,
                    confidence: issue.confidence,
                    severity: issue.severity,
                    learningTarget: issue.learningTarget
                      ? {
                          id: issue.learningTarget.id,
                          title: issue.learningTarget.title,
                          linkKind: issue.learningTarget.linkKind,
                          mergedOccurrences: issue.learningTarget.mergedOccurrences,
                        }
                      : null,
                  };
                  return <IssueCard key={issue.id} issue={data} />;
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <div>
            <LabelTiny>Targets affected</LabelTiny>
            <div className="flex flex-col gap-2 mt-2">
              {targets.length === 0 ? (
                <p className="text-[13px] text-ink-faint">None.</p>
              ) : (
                targets.map((t) => (
                  <LearningTargetMini
                    key={t.id}
                    title={t.title}
                    category={t.category}
                    seenCount={t.seenCount}
                    masteryLevel={t.masteryLevel}
                  />
                ))
              )}
            </div>
          </div>

          <div>
            <LabelTiny>Cards generated</LabelTiny>
            <div className="flex flex-col gap-2 mt-2">
              {analysis.cardsCreated.length === 0 ? (
                <p className="text-[13px] text-ink-faint">None.</p>
              ) : (
                analysis.cardsCreated.map((c) => <GeneratedCard key={c.id} card={c} />)
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function GeneratedCard({ card }: { card: CardCreated }) {
  const cat = card.learningTarget && isIssueCategory(card.learningTarget.category)
    ? card.learningTarget.category
    : 'grammar';
  const color = CATEGORY_COLOR[cat];
  const isSkipped = card.status !== 'active';
  return (
    <div className={cn('rounded border border-line bg-bg-elev p-4', color.cls)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge tone={isSkipped ? 'ghost' : 'sage'}>
          {card.cardType} · {isSkipped ? card.status : 'new'}
        </Badge>
        <span className="font-mono text-[10px] text-ink-faint">{isSkipped ? '—' : 'due in 10m'}</span>
      </div>
      <p className="font-serif text-[18px] leading-snug">{renderClozeAware(card.front)}</p>
      {card.learningTarget && (
        <p className="font-mono text-[11px] text-ink-faint mt-2">
          from target {card.learningTarget.title}
        </p>
      )}
    </div>
  );
}

function renderClozeAware(front: string) {
  const parts = front.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => {
    if (/^\{\{[^}]+\}\}$/.test(p)) {
      return (
        <span key={i} className="cloze-blank" data-revealed="false">
          {' '.repeat(Math.max(3, p.length - 4))}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
