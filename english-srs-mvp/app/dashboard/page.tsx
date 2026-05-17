'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import SubmissionsList from '@/components/SubmissionsList';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const LOGIN_ROUTE = '/login' as Route;

export default function DashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/v1/submissions', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorPayload;
        throw new Error(toUserMessage(body, res.status));
      }
      const body = (await res.json()) as { submissionId: string };
      router.push(`/submissions/${body.submissionId}` as Route);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignOut() {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    router.replace(LOGIN_ROUTE);
  }

  if (!authChecked) return <main className="dashboard-shell"><p className="muted">Loading…</p></main>;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-head">
        <h1>English SRS</h1>
        <button type="button" className="btn-ghost" onClick={onSignOut}>Sign out</button>
      </header>

      <section className="card">
        <h2>Submit text for analysis</h2>
        <form onSubmit={onSubmit} className="submit-form">
          <textarea
            className="textarea"
            placeholder="Paste a sentence or paragraph of English…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
          />
          {error && <p className="auth-error">Submit failed: {error}</p>}
          <button type="submit" className="btn" disabled={submitting || text.trim().length === 0}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Your recent submissions</h2>
        <SubmissionsList refreshKey={refreshKey} />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Refresh
        </button>
      </section>
    </main>
  );
}
