import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Strategy for testing the `after()` background task: we mock `next/server`
// so `after` enqueues callbacks into a shared array instead of running them
// post-response. Each test that exercises the background path explicitly
// awaits the captured callback to assert on its side effects.
const { afterCallbacks, mockProcessSubmission, mockRpc } = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void> | void>,
  mockProcessSubmission: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (fn: () => Promise<void> | void) => {
      afterCallbacks.push(fn);
    },
  };
});

vi.mock('@/lib/services/process-submission.service', () => ({
  processSubmission: mockProcessSubmission,
}));

vi.mock('@/lib/db/server', () => ({
  getSupabaseAdmin: () => ({ rpc: mockRpc }),
  getSupabaseUserClient: vi.fn(),
}));

import { POST } from '@/app/api/internal/webhooks/supabase-submission/route';

const SECRET = 'unit-test-webhook-secret';
const SUBMISSION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'INSERT',
    table: 'submissions',
    schema: 'public',
    record: {
      id: SUBMISSION_ID,
      user_id: USER_ID,
      status: 'pending',
      ...overrides,
    },
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/internal/webhooks/supabase-submission', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function flushAfter() {
  while (afterCallbacks.length > 0) {
    const fn = afterCallbacks.shift()!;
    await fn();
  }
}

describe('POST /api/internal/webhooks/supabase-submission', () => {
  const originalSecret = process.env.SUPABASE_WEBHOOK_SECRET;

  beforeEach(() => {
    afterCallbacks.length = 0;
    mockProcessSubmission.mockReset();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: null });
    process.env.SUPABASE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SUPABASE_WEBHOOK_SECRET;
    else process.env.SUPABASE_WEBHOOK_SECRET = originalSecret;
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await POST(makeRequest(validPayload()));
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('unauthorized');
    expect(afterCallbacks).toHaveLength(0);
  });

  it('returns 401 when the Authorization header carries the wrong secret', async () => {
    const response = await POST(
      makeRequest(validPayload(), { authorization: 'Bearer wrong-secret' }),
    );
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('unauthorized');
    expect(afterCallbacks).toHaveLength(0);
  });

  it('returns 500 when SUPABASE_WEBHOOK_SECRET is unset', async () => {
    delete process.env.SUPABASE_WEBHOOK_SECRET;
    const response = await POST(
      makeRequest(validPayload(), { authorization: `Bearer ${SECRET}` }),
    );
    expect(response.status).toBe(500);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('webhook_secret_unset');
    expect(afterCallbacks).toHaveLength(0);
  });

  it('returns 400 when the payload schema is invalid (UPDATE event)', async () => {
    const response = await POST(
      makeRequest(
        { ...validPayload(), type: 'UPDATE' },
        { authorization: `Bearer ${SECRET}` },
      ),
    );
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('invalid_payload');
    expect(afterCallbacks).toHaveLength(0);
  });

  it('returns 200 skipped:non_pending_status when record.status is not pending', async () => {
    const response = await POST(
      makeRequest(validPayload({ status: 'failed' }), {
        authorization: `Bearer ${SECRET}`,
      }),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { skipped: string };
    expect(json.skipped).toBe('non_pending_status');
    expect(afterCallbacks).toHaveLength(0);
    expect(mockProcessSubmission).not.toHaveBeenCalled();
  });

  it('returns 200 {accepted:true} for a valid pending insert and runs processSubmission in the background', async () => {
    mockProcessSubmission.mockResolvedValueOnce({
      issueCount: 2,
      createdCardIds: ['c1', 'c2'],
    });

    const response = await POST(
      makeRequest(validPayload(), { authorization: `Bearer ${SECRET}` }),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { accepted: boolean };
    expect(json.accepted).toBe(true);
    expect(afterCallbacks).toHaveLength(1);

    await flushAfter();
    expect(mockProcessSubmission).toHaveBeenCalledWith({
      submissionId: SUBMISSION_ID,
      userId: USER_ID,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('on a terminal error, the background task calls mark_submission_failed with the correct args', async () => {
    mockProcessSubmission.mockRejectedValueOnce(new Error('boom'));

    const response = await POST(
      makeRequest(validPayload(), { authorization: `Bearer ${SECRET}` }),
    );
    expect(response.status).toBe(200);

    await flushAfter();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('mark_submission_failed', {
      p_submission_id: SUBMISSION_ID,
      p_user_id: USER_ID,
      p_reason: 'boom',
    });
  });

  it('on a retryable error (status 503), the background task does NOT call mark_submission_failed', async () => {
    const retryableErr = Object.assign(new Error('upstream unavailable'), {
      status: 503,
    });
    mockProcessSubmission.mockRejectedValueOnce(retryableErr);

    const response = await POST(
      makeRequest(validPayload(), { authorization: `Bearer ${SECRET}` }),
    );
    expect(response.status).toBe(200);

    await flushAfter();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
