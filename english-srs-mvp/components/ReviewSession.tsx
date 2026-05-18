'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Flashcard } from '@/components/Flashcard';
import { RatingRow } from '@/components/RatingRow';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { trackEvent } from '@/lib/analytics/events';
import {
  initialState,
  reducer,
  type Phase,
  type Rating,
} from '@/lib/review/state-machine';
import type { ReviewQueueItem } from '@/lib/types/domain';
import { cn } from '@/lib/ui/cn';

const DASHBOARD_ROUTE = '/dashboard' as Route;
const LOGIN_ROUTE = '/login' as Route;
const REVIEW_DONE_ROUTE = '/review/done' as Route;
const UNAUTHORIZED_HINT = 'Your session expired';

const AUTO_ADVANCE_KEY = 'plait:autoAdvance';
const DEFAULT_AUTO_ADVANCE_MS = 2000;

function safeTrack(name: string, payload: Record<string, unknown>) {
  try {
    trackEvent(name, payload);
  } catch {
    // analytics must not propagate
  }
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function ReviewSession() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const doneLoggedRef = useRef(false);
  const emptyLoggedRef = useRef(false);
  const submittingRef = useRef(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoAdvanceMs] = useState(DEFAULT_AUTO_ADVANCE_MS);
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const [pendingAutoRating, setPendingAutoRating] = useState<Rating | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingAuto = useCallback(() => {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setPendingAutoRating(null);
  }, []);

  useEffect(() => () => clearPendingAuto(), [clearPendingAuto]);

  useEffect(() => {
    try {
      setAutoAdvance(window.localStorage.getItem(AUTO_ADVANCE_KEY) === '1');
    } catch {
      // ignore
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    dispatch({ type: 'fetch_started' });
    try {
      const res = await fetchWithAuth('/api/v1/review-queue');
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorPayload;
        throw new Error(toUserMessage(body, res.status));
      }
      const body = (await res.json()) as { cards: ReviewQueueItem[] };
      const now = Date.now();
      dispatch({ type: 'fetch_succeeded', cards: body.cards, now });
      if (body.cards.length > 0) {
        safeTrack('review_session_started', { cardsInQueue: body.cards.length });
      }
    } catch (e) {
      dispatch({
        type: 'fetch_failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    if (state.sessionStartedAt === 0) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - stateRef.current.sessionStartedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.sessionStartedAt]);

  useEffect(() => {
    const phase = state.phase;
    if (phase.kind !== 'submitting_rating') {
      submittingRef.current = false;
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;

    const cardId = phase.cards[phase.index].cardId;
    const cardType = phase.cards[phase.index].cardType;
    const rating = phase.rating;
    const responseMs = phase.responseMs;

    (async () => {
      try {
        const res = await fetchWithAuth('/api/v1/reviews', {
          method: 'POST',
          body: JSON.stringify({ cardId, rating, responseMs }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ErrorPayload;
          throw new Error(toUserMessage(body, res.status));
        }
        const body = (await res.json()) as { ok: true; nextDueAt: string };
        const now = Date.now();
        safeTrack('review_card_rated', { cardId, cardType, rating, responseMs, nextDueAt: body.nextDueAt });
        dispatch({ type: 'rating_succeeded', nextDueAt: body.nextDueAt, now });
      } catch (e) {
        dispatch({
          type: 'rating_failed',
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        submittingRef.current = false;
      }
    })();
  }, [state.phase]);

  // Rate handler. With auto-advance ON, defers dispatch by autoAdvanceMs
  // and shows a cancelable ring on the pressed button. Pressing another
  // rating pre-empts the timer; pressing Esc cancels and stays on
  // showing_answer.
  const triggerRate = useCallback(
    (rating: Rating) => {
      if (!autoAdvanceRef.current) {
        dispatch({ type: 'submit_rating', rating, now: Date.now() });
        return;
      }
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
      }
      setPendingAutoRating(rating);
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        dispatch({ type: 'submit_rating', rating, now: Date.now() });
      }, autoAdvanceMs);
    },
    [autoAdvanceMs],
  );

  // Hotkeys
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const phase = stateRef.current.phase;
      if (event.key === 'Escape') {
        if (pendingTimerRef.current !== null) {
          event.preventDefault();
          clearPendingAuto();
          return;
        }
        setFeedbackOpen(false);
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        if ('cards' in phase) {
          event.preventDefault();
          setFeedbackOpen((v) => !v);
        }
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        if (phase.kind === 'showing_question') {
          event.preventDefault();
          dispatch({ type: 'reveal' });
        }
        return;
      }
      if (phase.kind !== 'showing_answer') return;
      const map: Record<string, Rating> = { '1': 1, '2': 3, '3': 4, '4': 5 };
      const rating = map[event.key];
      if (rating !== undefined) {
        event.preventDefault();
        triggerRate(rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearPendingAuto, triggerRate]);

  // Clear the auto-advance pending state once the reducer has moved
  // past the answer/submitting pair. The ring on the rated button stays
  // visible through submitting_rating via state.phase.rating; we only
  // clear when we've actually advanced.
  useEffect(() => {
    const kind = state.phase.kind;
    if (kind !== 'showing_answer' && kind !== 'submitting_rating' && kind !== 'rating_error') {
      clearPendingAuto();
    }
  }, [state.phase.kind, clearPendingAuto]);

  useEffect(() => {
    if (state.phase.kind === 'done' && !doneLoggedRef.current) {
      doneLoggedRef.current = true;
      safeTrack('review_session_completed', {
        totalReviewed: state.phase.totalReviewed,
        totalSessionMs: state.phase.totalSessionMs,
        suspendedCount: state.phase.suspendedCount,
      });
      const params = new URLSearchParams({
        reviewed: String(state.phase.totalReviewed),
        ms: String(state.phase.totalSessionMs),
        suspended: String(state.phase.suspendedCount),
      });
      router.replace(`${REVIEW_DONE_ROUTE}?${params.toString()}` as Route);
    }
    if (state.phase.kind === 'empty_queue' && !emptyLoggedRef.current) {
      emptyLoggedRef.current = true;
      safeTrack('review_session_completed', { totalReviewed: 0, totalSessionMs: 0, suspendedCount: 0 });
    }
  }, [state.phase, router]);

  const handleSuspended = useCallback((cardId: string) => {
    setFeedbackOpen(false);
    dispatch({ type: 'feedback_suspended', cardId, now: Date.now() });
  }, []);

  const handleRate = useCallback(
    (rating: Rating) => {
      triggerRate(rating);
    },
    [triggerRate],
  );

  const handleReveal = useCallback(() => {
    dispatch({ type: 'reveal' });
  }, []);

  const handleRetry = useCallback(() => {
    dispatch({ type: 'retry_rating', now: Date.now() });
  }, []);

  const toggleAutoAdvance = useCallback(() => {
    setAutoAdvance((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(AUTO_ADVANCE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <ReviewChrome
      phase={state.phase}
      elapsedMs={elapsedMs}
      autoAdvance={autoAdvance}
      autoAdvanceMs={autoAdvanceMs}
      toggleAutoAdvance={toggleAutoAdvance}
      onReveal={handleReveal}
      onRate={handleRate}
      onSuspended={handleSuspended}
      onRetry={handleRetry}
      onTryAgain={() => dispatch({ type: 'try_again_after_queue_error' })}
      feedbackOpen={feedbackOpen}
      onCloseFeedback={() => setFeedbackOpen(false)}
      pendingAutoRating={pendingAutoRating}
    />
  );
}

interface ChromeProps {
  phase: Phase;
  elapsedMs: number;
  autoAdvance: boolean;
  autoAdvanceMs: number;
  toggleAutoAdvance: () => void;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onSuspended: (cardId: string) => void;
  onRetry: () => void;
  onTryAgain: () => void;
  feedbackOpen: boolean;
  onCloseFeedback: () => void;
  pendingAutoRating: Rating | null;
}

function ReviewChrome(props: ChromeProps) {
  const { phase } = props;

  if (phase.kind === 'loading_queue') {
    return (
      <main className="grid place-items-center min-h-screen bg-bg px-10">
        <div
          className="w-full max-w-[720px] rounded-[28px] border border-line bg-bg-card p-12 px-14 shadow-lift"
          role="status"
          aria-busy="true"
          aria-live="polite"
          aria-label="Loading review queue"
        >
          <Skeleton className="h-4 w-24 mb-6" />
          <div className="min-h-[160px] flex flex-col items-center justify-center gap-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
          </div>
          <div className="mt-7 pt-5 border-t border-dashed border-line-soft">
            <Skeleton className="h-5 w-1/2 mx-auto" />
          </div>
        </div>
      </main>
    );
  }

  if (phase.kind === 'empty_queue') {
    return (
      <main className="grid place-items-center min-h-screen bg-bg px-10">
        <div className="text-center max-w-[440px]">
          <h2 className="font-serif text-[48px] leading-none mb-3">Queue is empty</h2>
          <p className="text-[13px] text-ink-soft mb-6">
            Submit some new text or check back later.
          </p>
          <Link href={DASHBOARD_ROUTE}>
            <Button variant="primary">← Back to dashboard</Button>
          </Link>
        </div>
      </main>
    );
  }

  if (phase.kind === 'queue_error') {
    const isUnauthorized = phase.message.includes(UNAUTHORIZED_HINT);
    return (
      <main className="grid place-items-center min-h-screen bg-bg px-10">
        <div className="text-center max-w-[440px]">
          <h2 className="font-serif text-[28px] mb-3">We couldn&apos;t load your queue.</h2>
          <p className="text-[13px] text-rose-deep mb-5">{phase.message}</p>
          {isUnauthorized ? (
            <Link href={LOGIN_ROUTE}>
              <Button variant="primary">Sign in again</Button>
            </Link>
          ) : (
            <Button variant="primary" onClick={props.onTryAgain}>Try again</Button>
          )}
        </div>
      </main>
    );
  }

  if (phase.kind === 'done') {
    return null; // navigation happens elsewhere
  }

  const card = phase.cards[phase.index];
  const phaseLabel: 'question' | 'answer' = phase.kind === 'showing_question' ? 'question' : 'answer';
  const busy = phase.kind === 'submitting_rating';
  // Auto-advance pending rating wins over busy: during the wait the
  // reducer is still in showing_answer so we surface the pending button.
  // Once the timer fires and submitting_rating starts, the busy path
  // keeps the same button highlighted seamlessly.
  const pendingRating = props.pendingAutoRating ?? (busy ? phase.rating : null);
  const total = phase.cards.length;
  const current = phase.index + 1;
  const leftAfter = total - current;

  return (
    <main className="grid grid-rows-[auto_1fr_auto] min-h-screen bg-bg">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-10 py-6 gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={DASHBOARD_ROUTE}
            aria-label="Close review session"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-bg-elev text-ink-soft hover:text-ink hover:bg-bg-sunken"
          >
            <X size={14} strokeWidth={1.7} />
          </Link>
          <span className="font-mono text-[12px] text-ink-faint">
            {current} / {total} · {formatClock(props.elapsedMs)}
          </span>
        </div>
        <div
          className="flex items-center gap-1 max-w-[360px]"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Review progress"
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                'h-1 w-6 rounded-full',
                i < current - 1
                  ? 'bg-sage-deep'
                  : i === current - 1
                    ? 'bg-ink'
                    : 'bg-line-soft',
              )}
            />
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={props.toggleAutoAdvance}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono transition-colors',
              props.autoAdvance
                ? 'bg-sage/40 border-sage-deep/30 text-sage-deep'
                : 'bg-bg-elev border-line text-ink-faint',
            )}
            aria-pressed={props.autoAdvance}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', props.autoAdvance ? 'bg-sage-deep' : 'bg-ink-ghost')} />
            auto-advance · {Math.round(props.autoAdvanceMs / 1000)}s
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center justify-center gap-7 px-10 py-2">
        <Flashcard
          card={card}
          phase={phaseLabel}
          onSuspended={props.onSuspended}
          feedbackOpen={props.feedbackOpen}
          onCloseFeedback={props.onCloseFeedback}
        />
        {phaseLabel === 'question' ? (
          <Button variant="primary" size="lg" onClick={props.onReveal}>
            Show answer <Kbd>Space</Kbd>
          </Button>
        ) : (
          <RatingRow
            onRate={props.onRate}
            disabled={busy}
            pendingRating={pendingRating}
            autoAdvanceMs={props.autoAdvance ? props.autoAdvanceMs : undefined}
          />
        )}
        {phase.kind === 'rating_error' && (
          <div className="max-w-[720px] w-full rounded-md border border-rose-deep/30 bg-rose/30 p-4 flex items-center justify-between gap-4">
            <p className="text-[13px] text-rose-deep">{phase.message}</p>
            <Button variant="primary" size="sm" onClick={props.onRetry}>Retry</Button>
          </div>
        )}
      </div>

      <footer className="grid grid-cols-2 items-center px-10 py-4 text-[12px] text-ink-faint">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><Kbd>Space</Kbd> reveal</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>1-4</Kbd> rate</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>F</Kbd> flag</span>
        </div>
        <div className="text-right">
          {leftAfter > 0 ? `${leftAfter} left after this` : 'auto-finish at 0'}
        </div>
      </footer>
    </main>
  );
}
