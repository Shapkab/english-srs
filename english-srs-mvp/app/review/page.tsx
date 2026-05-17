'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ReviewSession from '@/components/ReviewSession';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const LOGIN_ROUTE = '/login' as Route;

export default function ReviewPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

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

  if (!authChecked) {
    return (
      <main className="review-shell">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return <ReviewSession />;
}
