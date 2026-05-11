'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
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
      <h1>Sign up</h1>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link href={LOGIN_ROUTE}>Sign in</Link>
      </p>
    </>
  );
}
