import { describe, expect, it } from 'vitest';
import {
  initialState,
  reducer,
  type Phase,
  type ReviewSessionState,
} from '@/lib/review/state-machine';
import type { ReviewQueueItem } from '@/lib/types/domain';

function card(id: string, label = id): ReviewQueueItem {
  return {
    cardId: id,
    cardType: 'correction',
    front: `front-${label}`,
    back: `back-${label}`,
    hint: null,
    dueAt: new Date(Date.now() - 1000).toISOString(),
    learningTarget: null,
  };
}

function phaseAt(state: ReviewSessionState, kind: Phase['kind']): Phase {
  expect(state.phase.kind).toBe(kind);
  return state.phase;
}

describe('review state machine', () => {
  it('1. loading_queue + fetch_succeeded(cards: []) -> empty_queue', () => {
    const next = reducer(initialState, { type: 'fetch_succeeded', cards: [], now: 1_000 });
    expect(next.phase).toEqual({ kind: 'empty_queue' });
    expect(next.sessionStartedAt).toBe(1_000);
  });

  it('2. loading_queue + fetch_succeeded(cards: [c1, c2]) -> showing_question(index 0)', () => {
    const cards = [card('c1'), card('c2')];
    const next = reducer(initialState, { type: 'fetch_succeeded', cards, now: 1_000 });
    const p = phaseAt(next, 'showing_question');
    if (p.kind !== 'showing_question') throw new Error('unreachable');
    expect(p.index).toBe(0);
    expect(p.questionShownAt).toBe(1_000);
    expect(p.cards).toHaveLength(2);
    expect(next.sessionStartedAt).toBe(1_000);
  });

  it('3. loading_queue + fetch_failed(msg) -> queue_error(msg)', () => {
    const next = reducer(initialState, { type: 'fetch_failed', message: 'boom' });
    expect(next.phase).toEqual({ kind: 'queue_error', message: 'boom' });
  });

  it('4. showing_question + reveal -> showing_answer', () => {
    const after = setup([card('c1')]);
    const next = reducer(after, { type: 'reveal' });
    expect(next.phase.kind).toBe('showing_answer');
  });

  it('5. showing_answer + submit_rating(4, now) -> submitting_rating with responseMs', () => {
    const after = setup([card('c1')]);
    const revealed = reducer(after, { type: 'reveal' });
    const next = reducer(revealed, { type: 'submit_rating', rating: 4, now: 1_750 });
    const p = phaseAt(next, 'submitting_rating');
    if (p.kind !== 'submitting_rating') throw new Error('unreachable');
    expect(p.rating).toBe(4);
    expect(p.responseMs).toBe(750);
  });

  it('6. submitting_rating + rating_succeeded at end of queue -> done', () => {
    const after = setup([card('c1')]);
    const revealed = reducer(after, { type: 'reveal' });
    const submitting = reducer(revealed, { type: 'submit_rating', rating: 4, now: 1_400 });
    const done = reducer(submitting, {
      type: 'rating_succeeded',
      nextDueAt: new Date().toISOString(),
      now: 1_500,
    });
    const p = phaseAt(done, 'done');
    if (p.kind !== 'done') throw new Error('unreachable');
    expect(p.totalReviewed).toBe(1);
    expect(p.totalSessionMs).toBe(500);
    expect(p.suspendedCount).toBe(0);
  });

  it('7. submitting_rating + rating_succeeded mid-queue -> showing_question(index+1, fresh ts)', () => {
    const after = setup([card('c1'), card('c2')]);
    const revealed = reducer(after, { type: 'reveal' });
    const submitting = reducer(revealed, { type: 'submit_rating', rating: 3, now: 1_400 });
    const advanced = reducer(submitting, {
      type: 'rating_succeeded',
      nextDueAt: new Date().toISOString(),
      now: 1_500,
    });
    const p = phaseAt(advanced, 'showing_question');
    if (p.kind !== 'showing_question') throw new Error('unreachable');
    expect(p.index).toBe(1);
    expect(p.questionShownAt).toBe(1_500);
    expect(advanced.totalReviewed).toBe(1);
  });

  it('8. submitting_rating + rating_failed(msg) -> rating_error(msg) with retained rating', () => {
    const after = setup([card('c1')]);
    const revealed = reducer(after, { type: 'reveal' });
    const submitting = reducer(revealed, { type: 'submit_rating', rating: 5, now: 1_400 });
    const failed = reducer(submitting, { type: 'rating_failed', message: 'nope' });
    const p = phaseAt(failed, 'rating_error');
    if (p.kind !== 'rating_error') throw new Error('unreachable');
    expect(p.rating).toBe(5);
    expect(p.message).toBe('nope');
    expect(p.responseMs).toBe(400);
  });

  it('9. rating_error + retry_rating -> submitting_rating with same rating + responseMs', () => {
    const after = setup([card('c1')]);
    const revealed = reducer(after, { type: 'reveal' });
    const submitting = reducer(revealed, { type: 'submit_rating', rating: 5, now: 1_400 });
    const failed = reducer(submitting, { type: 'rating_failed', message: 'nope' });
    const retried = reducer(failed, { type: 'retry_rating', now: 9_999 });
    const p = phaseAt(retried, 'submitting_rating');
    if (p.kind !== 'submitting_rating') throw new Error('unreachable');
    expect(p.rating).toBe(5);
    expect(p.responseMs).toBe(400); // not recomputed from new now
  });

  it('10a. feedback_suspended on current card mid-queue -> splice, advance, suspendedCount++', () => {
    const after = setup([card('a'), card('b'), card('c')]);
    const next = reducer(after, { type: 'feedback_suspended', cardId: 'a', now: 2_000 });
    const p = phaseAt(next, 'showing_question');
    if (p.kind !== 'showing_question') throw new Error('unreachable');
    expect(p.cards.map((c) => c.cardId)).toEqual(['b', 'c']);
    expect(p.index).toBe(0);
    expect(p.questionShownAt).toBe(2_000);
    expect(next.suspendedCount).toBe(1);
  });

  it('10b. feedback_suspended on the last remaining card -> done', () => {
    const after = setup([card('only')]);
    const next = reducer(after, { type: 'feedback_suspended', cardId: 'only', now: 5_000 });
    const p = phaseAt(next, 'done');
    if (p.kind !== 'done') throw new Error('unreachable');
    expect(p.totalReviewed).toBe(0);
    expect(p.suspendedCount).toBe(1);
    expect(p.totalSessionMs).toBe(5_000 - after.sessionStartedAt);
  });

  it('11. feedback_suspended for a non-current cardId (racy late response) -> unchanged', () => {
    const after = setup([card('a'), card('b')]);
    const next = reducer(after, { type: 'feedback_suspended', cardId: 'b', now: 9_999 });
    expect(next).toBe(after);
  });

  it('12. feedback_suspended while phase has no current card -> unchanged', () => {
    const noCardPhases: ReviewSessionState[] = [
      initialState, // loading_queue
      {
        phase: { kind: 'empty_queue' },
        sessionStartedAt: 1,
        suspendedCount: 0,
        totalReviewed: 0,
      },
      {
        phase: { kind: 'queue_error', message: 'x' },
        sessionStartedAt: 0,
        suspendedCount: 0,
        totalReviewed: 0,
      },
      {
        phase: { kind: 'done', totalReviewed: 1, totalSessionMs: 100, suspendedCount: 0 },
        sessionStartedAt: 0,
        suspendedCount: 0,
        totalReviewed: 1,
      },
    ];
    for (const s of noCardPhases) {
      const next = reducer(s, { type: 'feedback_suspended', cardId: 'whatever', now: 1 });
      expect(next).toBe(s);
    }
  });
});

function setup(cards: ReviewQueueItem[]): ReviewSessionState {
  return reducer(initialState, { type: 'fetch_succeeded', cards, now: 1_000 });
}
