'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';

// Brief delay so users see the success toast before the redirect tears
// the Composer down. Long enough to register, short enough not to feel
// like a stall.
const REDIRECT_AFTER_SUCCESS_MS = 1200;
// Match the prior localStorage debounce so the network-write cadence
// feels identical to the old behavior.
const DRAFT_SAVE_DEBOUNCE_MS = 250;

export function Composer() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track hydration so the debounced PUT doesn't fire with the empty
  // initial state and overwrite the server's draft.
  const hydratedRef = useRef(false);

  // Hydrate draft from the server after mount. Network errors are
  // swallowed — drafts are a nice-to-have UX, not a primary action.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/v1/drafts');
        if (!cancelled && res.ok) {
          const body = (await res.json()) as { draft: { content: string } | null };
          if (body.draft?.content) setText(body.draft.content);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce draft persistence so keystrokes don't hammer the API.
  // PUT for non-empty, DELETE for empty. Network errors swallowed.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          if (text.length > 0) {
            await fetchWithAuth('/api/v1/drafts', {
              method: 'PUT',
              body: JSON.stringify({ content: text }),
            });
          } else {
            await fetchWithAuth('/api/v1/drafts', { method: 'DELETE' });
          }
        } catch {
          // ignore
        }
      })();
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [text]);

  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const chars = text.length;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/v1/submissions', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorPayload;
        throw new Error(toUserMessage(body, res.status));
      }
      const body = (await res.json()) as { submissionId: string };
      // Fire-and-forget DELETE — the redirect has already happened by
      // the time this resolves; errors are not user-actionable.
      void fetchWithAuth('/api/v1/drafts', { method: 'DELETE' }).catch(() => {});
      setToastOpen(true);
      window.setTimeout(
        () => router.push(`/submissions/${body.submissionId}` as Route),
        REDIRECT_AFTER_SUCCESS_MS,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
      return;
    }
    // Keep `submitting` true through the post-success redirect so the
    // form stays disabled and the textarea can't be re-edited.
  }

  return (
    <>
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-line bg-bg-card overflow-hidden"
    >
      <div className="flex items-baseline justify-between gap-4 p-4 px-5">
        <h2 className="font-serif text-[20px] leading-tight">Submit something you wrote</h2>
        <span className="text-[12px] text-ink-faint">Email, message, journal — anything.</span>
      </div>
      <div className="px-5">
        <textarea
          ref={textareaRef}
          className="block w-full bg-transparent font-serif text-[22px] leading-[1.45] min-h-[130px] p-2 placeholder:text-ink-ghost focus:outline-none resize-y"
          placeholder="It was a great pleasure to discuss this matter with you yesterday…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Writing to analyze"
          required
        />
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line-soft p-3 px-5">
        <div className="font-mono text-[11px] text-ink-faint">
          EN · auto-detect &nbsp;·&nbsp; {chars} chars · {words} words
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[12px] text-rose-deep">{error}</span>}
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={submitting || text.trim().length === 0}
          >
            {submitting ? 'Analyzing…' : 'Analyze'}
            <ArrowRight size={14} strokeWidth={1.8} />
          </Button>
        </div>
      </div>
    </form>
    <Toast
      open={toastOpen}
      message="Submission sent for analysis"
      variant="success"
      onDismiss={() => setToastOpen(false)}
    />
    </>
  );
}
