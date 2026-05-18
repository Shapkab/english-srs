'use client';

import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { trackEvent } from '@/lib/analytics/events';
import { cn } from '@/lib/ui/cn';

type FeedbackType = 'too_easy' | 'too_hard' | 'not_useful' | 'duplicate' | 'wrong';

interface FeedbackOption {
  type: FeedbackType;
  label: string;
  subtitle: string;
  suspends: boolean;
}

const OPTIONS: FeedbackOption[] = [
  { type: 'too_easy', label: 'Too easy', subtitle: 'I know this — show less often.', suspends: false },
  { type: 'too_hard', label: 'Too hard', subtitle: 'This is too tough — show more often.', suspends: false },
  { type: 'not_useful', label: 'Not useful', subtitle: 'Suspend this card.', suspends: true },
  { type: 'duplicate', label: 'Duplicate', subtitle: 'Suspend; overlaps another card.', suspends: true },
  { type: 'wrong', label: 'Wrong', subtitle: 'Suspend; this card has an error.', suspends: true },
];

interface CardFeedbackMenuProps {
  cardId: string;
  onSuspended: (cardId: string) => void;
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export default function CardFeedbackMenu({
  cardId,
  onSuspended,
  externalOpen,
  onExternalClose,
}: CardFeedbackMenuProps) {
  const [open, setOpen] = useState(false);
  const isOpen = externalOpen ?? open;
  const close = () => {
    setOpen(false);
    onExternalClose?.();
  };
  const [pendingType, setPendingType] = useState<FeedbackType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<FeedbackOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      close();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function submit(option: FeedbackOption) {
    setError(null);
    setLastAttempt(option);
    setPendingType(option.type);
    try {
      const res = await fetchWithAuth(`/api/v1/cards/${cardId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ type: option.type, note: null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorPayload;
        throw new Error(toUserMessage(body, res.status));
      }
      try {
        trackEvent('card_feedback_submitted', {
          cardId,
          type: option.type,
          suspended: option.suspends,
        });
      } catch {
        // analytics must not propagate
      }
      if (option.suspends) {
        onSuspended(cardId);
      }
      close();
      setLastAttempt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingType(null);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Feedback for this card"
        aria-expanded={isOpen}
        onClick={() => (externalOpen === undefined ? setOpen((o) => !o) : close())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-bg-elev text-ink-soft hover:text-ink hover:bg-bg-sunken"
      >
        <Flag size={14} strokeWidth={1.7} />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-10 min-w-[260px] rounded-lg border border-line bg-bg-card shadow-lift p-1.5 z-20"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="menuitem"
              onClick={() => submit(option)}
              disabled={pendingType !== null}
              className={cn(
                'grid w-full gap-0.5 px-3 py-2 text-left rounded-md hover:bg-bg-elev text-[13px] disabled:opacity-50',
              )}
            >
              <span className="font-medium">
                {pendingType === option.type ? 'Saving…' : option.label}
              </span>
              <span className="text-[12px] text-ink-faint">{option.subtitle}</span>
            </button>
          ))}
          {error && (
            <div className="p-2 grid gap-2">
              <p className="text-[12px] text-rose-deep">{error}</p>
              {lastAttempt && (
                <button
                  type="button"
                  className="text-[12px] text-ink underline"
                  onClick={() => submit(lastAttempt)}
                  disabled={pendingType !== null}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
