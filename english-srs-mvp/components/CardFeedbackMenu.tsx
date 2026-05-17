'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { trackEvent } from '@/lib/analytics/events';

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
  { type: 'duplicate', label: 'Duplicate', subtitle: 'Suspend; this overlaps another card.', suspends: true },
  { type: 'wrong', label: 'Wrong', subtitle: 'Suspend; this card has an error.', suspends: true },
];

interface CardFeedbackMenuProps {
  cardId: string;
  onSuspended: (cardId: string) => void;
}

export default function CardFeedbackMenu({ cardId, onSuspended }: CardFeedbackMenuProps) {
  const [open, setOpen] = useState(false);
  const [pendingType, setPendingType] = useState<FeedbackType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<FeedbackOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

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
      setOpen(false);
      setLastAttempt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingType(null);
    }
  }

  return (
    <div className="feedback-menu" ref={containerRef}>
      <button
        type="button"
        className="feedback-menu__trigger"
        aria-label="Feedback for this card"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="feedback-menu__panel" role="menu">
          {OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="menuitem"
              className="feedback-menu__option"
              onClick={() => submit(option)}
              disabled={pendingType !== null}
            >
              <span>
                {pendingType === option.type ? 'Saving…' : option.label}
              </span>
              <span className="muted">{option.subtitle}</span>
            </button>
          ))}
          {error && (
            <div className="feedback-menu__error">
              <p className="auth-error">{error}</p>
              {lastAttempt && (
                <button
                  type="button"
                  className="btn-ghost"
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
