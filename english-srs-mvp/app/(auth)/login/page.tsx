'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const DASHBOARD_ROUTE = '/dashboard' as Route;
const SIGNUP_ROUTE = '/signup' as Route;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      router.replace(DASHBOARD_ROUTE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-[32px] leading-none mb-1">Welcome back</h1>
      <p className="text-[13px] text-ink-soft mb-6">Sign in to continue.</p>
      <form onSubmit={onSubmit} className="grid gap-3.5">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          required
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />
        {error && <p className="text-[13px] text-rose-deep">{error}</p>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-5 text-[12px] text-ink-faint">
        No account?{' '}
        <Link href={SIGNUP_ROUTE} className="text-ink underline">
          Sign up
        </Link>
      </p>
    </>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="block w-full rounded border border-line bg-bg-elev px-3 py-2 text-[14px] focus:outline-none focus:border-ink"
      />
    </label>
  );
}
