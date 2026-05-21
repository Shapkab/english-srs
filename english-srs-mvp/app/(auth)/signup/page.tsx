'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const DASHBOARD_ROUTE = '/dashboard' as Route;
const LOGIN_ROUTE = '/login' as Route;

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: signErr } = await supabase.auth.signUp({ email, password });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      if (data.session) {
        router.replace(DASHBOARD_ROUTE);
      } else {
        setInfo('Check your email for a confirmation link, then sign in.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-[32px] leading-none mb-1">Sign up</h1>
      <p className="text-[13px] text-ink-soft mb-6">Create your English SRS account.</p>
      <form onSubmit={onSubmit} className="grid gap-3.5">
        <label className="grid gap-1.5">
          <span className="text-[12px] text-ink-soft">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded border border-line bg-bg-elev px-3 py-2 text-[14px] focus:outline-none focus:border-ink"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] text-ink-soft">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="signup-password-hint"
            className="block w-full rounded border border-line bg-bg-elev px-3 py-2 text-[14px] focus:outline-none focus:border-ink"
          />
          <p id="signup-password-hint" className="text-[12px] text-ink-faint">At least 6 characters.</p>
        </label>
        {error && <p className="text-[13px] text-rose-deep">{error}</p>}
        {info && <p className="text-[13px] text-sage-deep">{info}</p>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>
      <p className="mt-5 text-[12px] text-ink-faint">
        Already have an account?{' '}
        <Link href={LOGIN_ROUTE} className="text-ink underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
