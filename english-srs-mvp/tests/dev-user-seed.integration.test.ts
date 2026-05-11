import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { POST as submissionsPost } from '@/app/api/v1/submissions/route';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envReady = Boolean(url && serviceKey);
const suite = envReady ? describe : describe.skip;

if (!envReady) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Skipping dev-user-seed tests — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY to run them.',
  );
}

function randomUuid(): string {
  return crypto.randomUUID();
}

suite('DEV_USER_ID auto-seed of users_profile (R-015)', () => {
  let admin: SupabaseClient;
  const originalDevUserId = process.env.DEV_USER_ID;
  let testUserId = '';

  beforeEach(() => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    testUserId = randomUuid();
    process.env.DEV_USER_ID = testUserId;
  });

  afterEach(async () => {
    // restore env
    if (originalDevUserId === undefined) delete process.env.DEV_USER_ID;
    else process.env.DEV_USER_ID = originalDevUserId;

    // cleanup any rows the test created (best-effort)
    if (testUserId) {
      try {
        await admin.from('submissions').delete().eq('user_id', testUserId);
        await admin.from('users_profile').delete().eq('id', testUserId);
      } catch {
        /* best effort */
      }
    }
  });

  afterAll(() => {
    if (originalDevUserId === undefined) delete process.env.DEV_USER_ID;
    else process.env.DEV_USER_ID = originalDevUserId;
  });

  it('first submission with DEV_USER_ID auto-seeds users_profile and writes successfully', async () => {
    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'I goed to school yesterday.' }),
    });

    const response = await submissionsPost(request);
    expect(response.status).toBe(201);

    const json = (await response.json()) as { submissionId: string; status: string };
    expect(json.submissionId).toMatch(/^[0-9a-f-]{36}$/i);

    const { data: profile } = await admin
      .from('users_profile')
      .select('id, email')
      .eq('id', testUserId)
      .maybeSingle();
    expect(profile).not.toBeNull();
    expect(profile!.id).toBe(testUserId);

    const { data: submission } = await admin
      .from('submissions')
      .select('id, user_id')
      .eq('id', json.submissionId)
      .maybeSingle();
    expect(submission).not.toBeNull();
    expect(submission!.user_id).toBe(testUserId);
  });

  it('rejects a non-UUID DEV_USER_ID with 500 invalid_dev_user_id', async () => {
    process.env.DEV_USER_ID = 'not-a-uuid';
    testUserId = ''; // skip the per-test cleanup since no rows are written

    const request = new Request('http://localhost/api/v1/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });

    const response = await submissionsPost(request);
    expect(response.status).toBe(500);
    const json = (await response.json()) as { code: string };
    expect(json.code).toBe('invalid_dev_user_id');
  });
});
