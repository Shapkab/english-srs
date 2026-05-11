'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api/client';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const LOGIN_ROUTE = '/login' as Route;
const DASHBOARD_ROUTE = '/dashboard' as Route;

interface Issue {
  id: string;
  category: string;
  errorText: string;
  correctedText: string;
  explanationShort: string;
  confidence: number;
  shouldCreateCard: boolean;
}

interface CardCreated {
  id: string;
  front: string;
  back: string;
}

interface AnalysisResponse {
  correctedText: string | null;
  summary: string | null;
  issues: Issue[];
  cardsCreated: CardCreated[];
}

export default function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [authChecked, setAuthChecked] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace(LOGIN_ROUTE);
        return;
      }
      setAuthChecked(true);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await fetchWithAuth(`/api/v1/submissions/${id}/analysis`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          throw new Error(body.code ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as AnalysisResponse;
        if (cancelled) return;
        setAnalysis(body);
        if (body.correctedText !== null && timer !== null) {
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

    poll();
    timer = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [authChecked, id]);

  if (!authChecked) return <main className="dashboard-shell"><p className="muted">Loading…</p></main>;

  const ready = analysis !== null && analysis.correctedText !== null;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-head">
        <h1>Submission</h1>
        <Link href={DASHBOARD_ROUTE} className="btn-ghost">← Back to dashboard</Link>
      </header>

      {error && <p className="auth-error">Failed to load analysis: {error}</p>}

      {!ready ? (
        <section className="card">
          <h2>Analyzing…</h2>
          <p className="muted">
            The worker is processing this submission. This page polls every 2 seconds; the results
            usually appear within ~30 seconds once <code>npm run worker:dev</code> is running.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Corrected text</h2>
            <p>{analysis!.correctedText}</p>
            {analysis!.summary && <p className="muted">{analysis!.summary}</p>}
          </section>

          <section className="card">
            <h2>Issues</h2>
            {analysis!.issues.length === 0 ? (
              <p className="muted">No issues flagged.</p>
            ) : (
              <ul className="card-grid">
                {analysis!.issues.map((issue) => (
                  <li key={issue.id} className="card-row">
                    <div className="card-row-head">
                      <span className="badge badge-analyzed">{issue.category}</span>
                      <span className="muted">confidence {Math.round(issue.confidence * 100)}%</span>
                    </div>
                    <p>
                      <s>{issue.errorText}</s> → <strong>{issue.correctedText}</strong>
                    </p>
                    <p className="muted">{issue.explanationShort}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Cards created</h2>
            {analysis!.cardsCreated.length === 0 ? (
              <p className="muted">No cards were created from this submission.</p>
            ) : (
              <ul className="card-grid">
                {analysis!.cardsCreated.map((card) => (
                  <li key={card.id} className="card-row">
                    <p><strong>Front:</strong> {card.front}</p>
                    <p><strong>Back:</strong> {card.back}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
