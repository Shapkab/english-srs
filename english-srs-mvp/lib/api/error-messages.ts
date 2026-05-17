// Map server-side typed error codes (from lib/http/errors.ts toErrorResponse)
// to messages a non-technical user can act on. Codes that aren't in the map
// fall back to a generic message. Server log lines retain the original code
// via requestId for correlation.

type KnownCode =
  | 'rate_limited'
  | 'unauthorized'
  | 'validation_error'
  | 'internal_error'
  | 'not_found';

const USER_FACING: Record<KnownCode, string> = {
  rate_limited: "You've reached your hourly submission limit. Try again in a bit.",
  unauthorized: "Your session expired. Please sign in again.",
  validation_error: "Some of your input wasn't accepted. Check the form and try again.",
  internal_error: "Something went wrong on our end. We've logged it — please try again.",
  not_found: "We couldn't find that.",
};

const GENERIC_500 = "Something went wrong on our end. Please try again.";
const GENERIC_FALLBACK = "Something didn't work. Please try again.";

export interface ErrorPayload {
  code?: string;
  requestId?: string;
  issues?: unknown;
}

/**
 * Convert an API error response into a user-facing message.
 * Appends the requestId on internal_error so bug reports are traceable to logs.
 */
export function toUserMessage(payload: ErrorPayload | null | undefined, status: number): string {
  const code = payload?.code;

  if (code && code in USER_FACING) {
    const base = USER_FACING[code as KnownCode];
    if (code === 'internal_error' && payload?.requestId) {
      return `${base} (id: ${payload.requestId})`;
    }
    return base;
  }

  if (status >= 500) return GENERIC_500;
  return GENERIC_FALLBACK;
}
