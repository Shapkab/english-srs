'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const LOGIN_ROUTE = '/login' as Route;

interface AuthGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AuthGate({ children, fallback }: AuthGateProps) {
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
      <>{fallback ?? <div role="status" aria-busy="true" aria-live="polite" className="min-h-screen bg-bg" />}</>
    );
  }
  return <>{children}</>;
}
