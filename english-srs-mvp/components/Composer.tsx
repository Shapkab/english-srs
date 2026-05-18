'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';

const DRAFT_KEY = 'plait:draft';
// Brief delay so users see the success toast before the redirect tears
// the Composer down. Long enough to register, short enough not to feel
// like a stall.
const REDIRECT_AFTER_SUCCESS_MS = 1200;

export function Composer() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate draft after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      if (saved) setText(saved);
    } catch {
      // ignore
    }
  }, []);

  // Debounce draft persistence so keystrokes don't hammer localStorage.
  // 250ms matches typical typing burst length; pending writes flush on
  // unmount via the cleanup return.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        if (text.length > 0) window.localStorage.setItem(DRAFT_KEY, text);
        else window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    }, 250);
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
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
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
