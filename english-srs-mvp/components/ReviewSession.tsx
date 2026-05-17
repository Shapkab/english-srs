'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import ReviewCard from '@/components/ReviewCard';
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

const DASHBOARD_ROUTE = '/dashboard' as Route;
const LOGIN_ROUTE = '/login' as Route;
const UNAUTHORIZED_HINT = 'Your session expired';

function safeTrack(name: string, payload: Record<string, unknown>) {
  try {
    trackEvent(name, payload);
  } catch {
    // analytics must not propagate
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

export default function ReviewSession() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const doneLoggedRef = useRef(false);
  const emptyLoggedRef = useRef(false);
  const submittingRef = useRef(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const showShortcutsRef = useRef(showShortcuts);
  showShortcutsRef.current = showShortcuts;

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
        const hasBacklog = body.cards.some(
          (c) => Date.now() - new Date(c.dueAt).getTime() > 60 * 60 * 1000,
        );
        safeTrack('review_session_started', {
          cardsInQueue: body.cards.length,
          hasBacklog,
        });
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

  // Submit a rating whenever phase is submitting_rating.
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
        safeTrack('review_card_rated', {
          cardId,
          cardType,
          rating,
          responseMs,
          nextDueAt: body.nextDueAt,
        });
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

  // Keyboard handler.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (event.key === 'Escape') {
        if (showShortcutsRef.current) {
          event.preventDefault();
          setShowShortcuts(false);
        }
        return;
      }
      if (showShortcutsRef.current) return;

      const phase = stateRef.current.phase;
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
        dispatch({ type: 'submit_rating', rating, now: Date.now() });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // One-shot done analytics.
  useEffect(() => {
    if (state.phase.kind === 'done' && !doneLoggedRef.current) {
      doneLoggedRef.current = true;
      safeTrack('review_session_completed', {
        totalReviewed: state.phase.totalReviewed,
        totalSessionMs: state.phase.totalSessionMs,
        suspendedCount: state.phase.suspendedCount,
      });
    }
    if (state.phase.kind === 'empty_queue' && !emptyLoggedRef.current) {
      emptyLoggedRef.current = true;
      safeTrack('review_session_completed', {
        totalReviewed: 0,
        totalSessionMs: 0,
        suspendedCount: 0,
      });
    }
  }, [state.phase]);

  const handleSuspended = useCallback((cardId: string) => {
    dispatch({ type: 'feedback_suspended', cardId, now: Date.now() });
  }, []);

  const handleRate = useCallback((rating: Rating) => {
    dispatch({ type: 'submit_rating', rating, now: Date.now() });
  }, []);

  const handleReveal = useCallback(() => {
    dispatch({ type: 'reveal' });
  }, []);

  const handleRetry = useCallback(() => {
    dispatch({ type: 'retry_rating', now: Date.now() });
  }, []);

  return (
    <>
      {renderPhase(state.phase, {
        onReveal: handleReveal,
        onRate: handleRate,
        onSuspended: handleSuspended,
        onRetry: handleRetry,
        onTryAgain: () => dispatch({ type: 'try_again_after_queue_error' }),
      })}
      {showShortcuts && (
        <div
          className="shortcuts-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="shortcuts-overlay__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Keyboard shortcuts</h3>
            <dl>
              <dt>Space / Enter</dt><dd>Reveal answer</dd>
              <dt>1</dt><dd>Again</dd>
              <dt>2</dt><dd>Hard</dd>
              <dt>3</dt><dd>Good</dd>
              <dt>4</dt><dd>Easy</dd>
              <dt>?</dt><dd>Toggle this panel</dd>
              <dt>Esc</dt><dd>Close this panel</dd>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

interface RenderHandlers {
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onSuspended: (cardId: string) => void;
  onRetry: () => void;
  onTryAgain: () => void;
}

function renderPhase(phase: Phase, handlers: RenderHandlers) {
  if (phase.kind === 'loading_queue') {
    return (
      <main className="review-shell">
        <p className="muted">Loading your queue…</p>
      </main>
    );
  }

  if (phase.kind === 'empty_queue') {
    return (
      <main className="review-shell">
        <section className="card">
          <h2>You&apos;re all caught up.</h2>
          <p className="muted">No cards are due right now.</p>
          <Link href={DASHBOARD_ROUTE} className="btn-ghost">← Back to dashboard</Link>
        </section>
      </main>
    );
  }

  if (phase.kind === 'queue_error') {
    const isUnauthorized = phase.message.includes(UNAUTHORIZED_HINT);
    return (
      <main className="review-shell">
        <section className="card">
          <h2>We couldn&apos;t load your queue.</h2>
          <p className="auth-error">{phase.message}</p>
          {isUnauthorized ? (
            <Link href={LOGIN_ROUTE} className="btn">Sign in again</Link>
          ) : (
            <button type="button" className="btn" onClick={handlers.onTryAgain}>
              Try again
            </button>
          )}
        </section>
      </main>
    );
  }

  if (phase.kind === 'done') {
    return (
      <main className="review-shell">
        <section className="card">
          <h2>You finished {phase.totalReviewed} cards. See you tomorrow.</h2>
          <p className="muted">Reviewed in {formatDuration(phase.totalSessionMs)}.</p>
          <Link href={DASHBOARD_ROUTE} className="btn">← Back to dashboard</Link>
        </section>
      </main>
    );
  }

  // showing_question / showing_answer / submitting_rating / rating_error
  const card = phase.cards[phase.index];
  const renderPhaseLabel: 'question' | 'answer' =
    phase.kind === 'showing_question' ? 'question' : 'answer';
  const busy = phase.kind === 'submitting_rating';

  return (
    <main className="review-shell">
      <header className="dashboard-head">
        <Link href={DASHBOARD_ROUTE} className="btn-ghost">← Dashboard</Link>
      </header>
      <ReviewCard
        card={card}
        phase={renderPhaseLabel}
        progress={{ current: phase.index + 1, total: phase.cards.length }}
        onReveal={handlers.onReveal}
        onRate={handlers.onRate}
        onSuspended={handlers.onSuspended}
        busy={busy}
      />
      {phase.kind === 'rating_error' && (
        <section className="card">
          <p className="auth-error">{phase.message}</p>
          <button type="button" className="btn" onClick={handlers.onRetry}>
            Retry
          </button>
        </section>
      )}
    </main>
  );
}
