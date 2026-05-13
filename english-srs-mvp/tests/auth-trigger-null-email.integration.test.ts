import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The trigger fires on `after insert on auth.users`. To exercise the
// NULL-email path we need to insert a row with email IS NULL — GoTrue's
// admin API requires an email or phone, so we go through a direct
// Postgres connection inside the local supabase container.
const DB_CONTAINER = 'supabase_db_english-srs-mvp';

function dockerExec(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

function dockerAvailable(): boolean {
  try {
    dockerExec('select 1');
    return true;
  } catch {
    return false;
  }
}

const envReady = Boolean(url && serviceKey) && dockerAvailable();
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping auth-trigger-null-email tests — needs running local ' +
      'Supabase stack with Docker container reachable.',
  );
}

suite('handle_new_auth_user tolerates NULL auth.users.email (Panel H3)', () => {
  let admin: SupabaseClient;
  const testUserId = crypto.randomUUID();

  beforeAll(() => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(() => {
    try {
      dockerExec(`delete from public.users_profile where id = '${testUserId}';`);
      dockerExec(`delete from auth.users where id = '${testUserId}';`);
    } catch {
      // best effort
    }
  });

  it('auto-seeds users_profile with sentinel email when auth.users.email is NULL', async () => {
    dockerExec(`insert into auth.users (id) values ('${testUserId}');`);

    const { data: profile, error } = await admin
      .from('users_profile')
      .select('id, email')
      .eq('id', testUserId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(profile).not.toBeNull();
    expect(profile!.id).toBe(testUserId);
    expect(profile!.email).toBe(`noemail+${testUserId}@placeholder.local`);
  });
});
