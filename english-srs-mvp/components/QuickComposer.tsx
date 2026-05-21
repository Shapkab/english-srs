'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { cn } from '@/lib/ui/cn';

const DRAFT_KEY = 'plait:quick-draft';
const MIN_LENGTH = 10;
const MAX_LENGTH = 10_000;

export function QuickComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: prefer text shared via the Web Share Target (?text=), then
  // strip the param from the URL; otherwise restore the saved draft.
  useEffect(() => {
    const shared = searchParams.get('text');
    if (shared) {
      setText(shared);
      window.history.replaceState({}, '', '/submit');
    } else {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) setText(saved);
      } catch {
        // localStorage unavailable
      }
    }
    textareaRef.current?.focus();
  }, [searchParams]);

  // Persist draft on change.
  useEffect(() => {
    try {
      if (text.trim()) {
        localStorage.setItem(DRAFT_KEY, text);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }, [text]);

  const charCount = text.length;
  const isValid = charCount >= MIN_LENGTH && charCount <= MAX_LENGTH;

  const handleSubmit = useCallback(async () => {
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/v1/submissions', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorPayload;
        throw new Error(toUserMessage(body, res.status));
      }
      const { submissionId } = (await res.json()) as { submissionId: string };

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // localStorage unavailable
      }

      router.push(`/submissions/${submissionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
      setSubmitting(false);
    }
  }, [isValid, submitting, text, router]);

  function handleClose() {
    router.back();
  }

  // Submit on Cmd/Ctrl+Enter.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSubmit]);

  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line">
        <button
          onClick={handleClose}
          className="p-2 -ml-2 text-ink-soft hover:text-ink min-h-[44px] min-w-[44px]"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <span className="text-sm font-medium">Submit Text</span>
        <button
          onClick={() => void handleSubmit()}
          disabled={!isValid || submitting}
          className={cn(
            'p-2 -mr-2 rounded-full transition-colors min-h-[44px] min-w-[44px]',
            isValid && !submitting
              ? 'text-sage-deep hover:bg-sage/20'
              : 'text-ink-ghost cursor-not-allowed',
          )}
          aria-label="Submit"
        >
          <Send size={20} />
        </button>
      </header>

      <div className="flex-1 p-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type the English text you want analyzed..."
          className={cn(
            'w-full h-full min-h-[200px] resize-none bg-transparent',
            'text-[16px] leading-relaxed placeholder:text-ink-ghost',
            'focus:outline-none',
          )}
          maxLength={MAX_LENGTH}
          disabled={submitting}
        />
      </div>

      <footer className="px-4 py-3 border-t border-line">
        {error && <p className="text-sm text-rose-deep mb-2">{error}</p>}
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <span>
            {charCount < MIN_LENGTH
              ? `${MIN_LENGTH - charCount} more characters needed`
              : `${charCount.toLocaleString()} / ${MAX_LENGTH.toLocaleString()}`}
          </span>
          <span className="hidden sm:inline">&#8984;&#8617; to submit</span>
        </div>
      </footer>
    </main>
  );
}
