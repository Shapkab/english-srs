'use client';

import { getBrowserSupabase } from '@/lib/supabase/browser';

export async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set('authorization', `Bearer ${data.session.access_token}`);
  }
  if (!headers.has('content-type') && init.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return fetch(path, { ...init, headers });
}
