import type { ReviewQueueItem } from '@/lib/types/domain';

export type Rating = 1 | 3 | 4 | 5;

export type Phase =
  | { kind: 'loading_queue' }
  | { kind: 'empty_queue' }
  | {
      kind: 'showing_question';
      cards: ReviewQueueItem[];
      index: number;
      questionShownAt: number;
    }
  | {
      kind: 'showing_answer';
      cards: ReviewQueueItem[];
      index: number;
      questionShownAt: number;
    }
  | {
      kind: 'submitting_rating';
      cards: ReviewQueueItem[];
      index: number;
      questionShownAt: number;
      rating: Rating;
      responseMs: number;
    }
  | {
      kind: 'rating_error';
      cards: ReviewQueueItem[];
      index: number;
      questionShownAt: number;
      rating: Rating;
      responseMs: number;
      message: string;
    }
  | {
      kind: 'done';
      totalReviewed: number;
      totalSessionMs: number;
      suspendedCount: number;
    }
  | { kind: 'queue_error'; message: string };

export interface ReviewSessionState {
  phase: Phase;
  sessionStartedAt: number;
  suspendedCount: number;
  totalReviewed: number;
}

export type Event =
  | { type: 'fetch_started' }
  | { type: 'fetch_succeeded'; cards: ReviewQueueItem[]; now: number }
  | { type: 'fetch_failed'; message: string }
  | { type: 'reveal' }
  | { type: 'submit_rating'; rating: Rating; now: number }
  | { type: 'rating_succeeded'; nextDueAt: string; now: number }
  | { type: 'rating_failed'; message: string }
  | { type: 'retry_rating'; now: number }
  | { type: 'feedback_suspended'; cardId: string; now: number }
  | { type: 'try_again_after_queue_error' };

export const initialState: ReviewSessionState = {
  phase: { kind: 'loading_queue' },
  sessionStartedAt: 0,
  suspendedCount: 0,
  totalReviewed: 0,
};

export function reducer(state: ReviewSessionState, event: Event): ReviewSessionState {
  const { phase } = state;

  if (event.type === 'fetch_started') {
    return state.phase.kind === 'loading_queue' ? state : { ...state, phase: { kind: 'loading_queue' } };
  }

  if (event.type === 'fetch_succeeded') {
    if (phase.kind !== 'loading_queue') return state;
    if (event.cards.length === 0) {
      return {
        phase: { kind: 'empty_queue' },
        sessionStartedAt: event.now,
        suspendedCount: 0,
        totalReviewed: 0,
      };
    }
    return {
      phase: {
        kind: 'showing_question',
        cards: event.cards,
        index: 0,
        questionShownAt: event.now,
      },
      sessionStartedAt: event.now,
      suspendedCount: 0,
      totalReviewed: 0,
    };
  }

  if (event.type === 'fetch_failed') {
    if (phase.kind !== 'loading_queue') return state;
    return {
      phase: { kind: 'queue_error', message: event.message },
      sessionStartedAt: 0,
      suspendedCount: 0,
      totalReviewed: 0,
    };
  }

  if (event.type === 'try_again_after_queue_error') {
    if (phase.kind !== 'queue_error') return state;
    return { ...state, phase: { kind: 'loading_queue' } };
  }

  if (event.type === 'reveal') {
    if (phase.kind !== 'showing_question') return state;
    return {
      ...state,
      phase: { ...phase, kind: 'showing_answer' },
    };
  }

  if (event.type === 'submit_rating') {
    if (phase.kind !== 'showing_answer') return state;
    return {
      ...state,
      phase: {
        kind: 'submitting_rating',
        cards: phase.cards,
        index: phase.index,
        questionShownAt: phase.questionShownAt,
        rating: event.rating,
        responseMs: Math.max(0, event.now - phase.questionShownAt),
      },
    };
  }

  if (event.type === 'rating_succeeded') {
    if (phase.kind !== 'submitting_rating') return state;
    const newTotalReviewed = state.totalReviewed + 1;
    const isLast = phase.index >= phase.cards.length - 1;
    if (isLast) {
      return {
        ...state,
        totalReviewed: newTotalReviewed,
        phase: {
          kind: 'done',
          totalReviewed: newTotalReviewed,
          totalSessionMs: event.now - state.sessionStartedAt,
          suspendedCount: state.suspendedCount,
        },
      };
    }
    return {
      ...state,
      totalReviewed: newTotalReviewed,
      phase: {
        kind: 'showing_question',
        cards: phase.cards,
        index: phase.index + 1,
        questionShownAt: event.now,
      },
    };
  }

  if (event.type === 'rating_failed') {
    if (phase.kind !== 'submitting_rating') return state;
    return {
      ...state,
      phase: {
        kind: 'rating_error',
        cards: phase.cards,
        index: phase.index,
        questionShownAt: phase.questionShownAt,
        rating: phase.rating,
        responseMs: phase.responseMs,
        message: event.message,
      },
    };
  }

  if (event.type === 'retry_rating') {
    if (phase.kind !== 'rating_error') return state;
    return {
      ...state,
      phase: {
        kind: 'submitting_rating',
        cards: phase.cards,
        index: phase.index,
        questionShownAt: phase.questionShownAt,
        rating: phase.rating,
        responseMs: phase.responseMs,
      },
    };
  }

  if (event.type === 'feedback_suspended') {
    const phasesWithCards = ['showing_question', 'showing_answer', 'submitting_rating', 'rating_error'] as const;
    if (!phasesWithCards.includes(phase.kind as (typeof phasesWithCards)[number])) {
      return state;
    }
    const carded = phase as Extract<Phase, { cards: ReviewQueueItem[] }>;
    if (carded.cards[carded.index]?.cardId !== event.cardId) {
      return state;
    }
    const remaining = [...carded.cards.slice(0, carded.index), ...carded.cards.slice(carded.index + 1)];
    const newSuspendedCount = state.suspendedCount + 1;
    if (remaining.length === 0) {
      return {
        ...state,
        suspendedCount: newSuspendedCount,
        phase: {
          kind: 'done',
          totalReviewed: state.totalReviewed,
          totalSessionMs: event.now - state.sessionStartedAt,
          suspendedCount: newSuspendedCount,
        },
      };
    }
    // Splice keeps the next card at the same index; if the spliced card was
    // the last one, the new index is clamped to the new last position.
    const newIndex = Math.min(carded.index, remaining.length - 1);
    return {
      ...state,
      suspendedCount: newSuspendedCount,
      phase: {
        kind: 'showing_question',
        cards: remaining,
        index: newIndex,
        questionShownAt: event.now,
      },
    };
  }

  return state;
}
