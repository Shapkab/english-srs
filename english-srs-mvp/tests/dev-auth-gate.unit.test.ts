import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the admin client so case 4 (bypass activates) does not actually
// reach Supabase — this test is purely about the three-condition gate.
vi.mock('@/lib/db/server', () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  return {
    getSupabaseAdmin: vi.fn().mockReturnValue({ from }),
    getSupabaseUserClient: vi.fn(),
  };
});

import { requireUserContext } from '@/lib/auth/user';
import { HttpError } from '@/lib/http/errors';

const VALID_DEV_UUID = '11111111-1111-1111-1111-111111111111';

function noAuthRequest(): Request {
  return new Request('http://localhost/api/v1/submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

describe('requireUserContext DEV_USER_ID three-condition gate (Panel H2)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevUserId = process.env.DEV_USER_ID;
  const originalEnableDevAuth = process.env.ENABLE_DEV_AUTH;

  beforeEach(() => {
    delete process.env.DEV_USER_ID;
    delete process.env.ENABLE_DEV_AUTH;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
    if (originalDevUserId === undefined) delete process.env.DEV_USER_ID;
    else process.env.DEV_USER_ID = originalDevUserId;
    if (originalEnableDevAuth === undefined) delete process.env.ENABLE_DEV_AUTH;
    else process.env.ENABLE_DEV_AUTH = originalEnableDevAuth;
  });

  it('NODE_ENV=production + both dev vars set: bypass does NOT activate', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.DEV_USER_ID = VALID_DEV_UUID;
    process.env.ENABLE_DEV_AUTH = '1';

    await expect(requireUserContext(noAuthRequest())).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  it('NODE_ENV=development + DEV_USER_ID, no ENABLE_DEV_AUTH: bypass does NOT activate', async () => {
    process.env.DEV_USER_ID = VALID_DEV_UUID;
    // ENABLE_DEV_AUTH intentionally unset

    await expect(requireUserContext(noAuthRequest())).rejects.toBeInstanceOf(HttpError);
    await expect(requireUserContext(noAuthRequest())).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  it('NODE_ENV=development + ENABLE_DEV_AUTH=1, no DEV_USER_ID: bypass does NOT activate', async () => {
    process.env.ENABLE_DEV_AUTH = '1';
    // DEV_USER_ID intentionally unset

    await expect(requireUserContext(noAuthRequest())).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  it('NODE_ENV=development + DEV_USER_ID + ENABLE_DEV_AUTH=1: bypass activates', async () => {
    process.env.DEV_USER_ID = VALID_DEV_UUID;
    process.env.ENABLE_DEV_AUTH = '1';

    const ctx = await requireUserContext(noAuthRequest());
    expect(ctx.userId).toBe(VALID_DEV_UUID);
    expect(ctx.supabase).toBeDefined();
  });
});
