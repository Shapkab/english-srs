'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api/client';

interface SubmissionRow {
  id: string;
  status: 'pending' | 'analyzed' | 'failed' | string;
  original_text: string;
  created_at: string;
}

export default function SubmissionsList({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const res = await fetchWithAuth('/api/v1/submissions');
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          throw new Error(body.code ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { submissions: SubmissionRow[] };
        if (!cancelled) setRows(body.submissions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) return <p className="auth-error">Failed to load submissions: {error}</p>;
  if (rows === null) return <p className="muted">Loading…</p>;
  if (rows.length === 0) return <p className="muted">No submissions yet — submit some text above.</p>;

  return (
    <ul className="card-grid">
      {rows.map((row) => (
        <li key={row.id} className="card-row">
          <Link href={`/submissions/${row.id}` as Route}>
            <div className="card-row-head">
              <span className={`badge badge-${row.status}`}>{row.status}</span>
              <span className="muted">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <p className="card-row-text">{row.original_text}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
