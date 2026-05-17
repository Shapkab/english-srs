'use client';

import CardFeedbackMenu from '@/components/CardFeedbackMenu';
import { parseCloze, type ClozeSegment } from '@/lib/cards/parse-cloze';
import type { ReviewQueueItem } from '@/lib/types/domain';
import type { Rating } from '@/lib/review/state-machine';

interface ReviewCardProps {
  card: ReviewQueueItem;
  phase: 'question' | 'answer';
  progress: { current: number; total: number };
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onSuspended: (cardId: string) => void;
  busy?: boolean;
}

interface RatingButton {
  label: string;
  rating: Rating;
  kbd: string;
  className: string;
  aria: string;
}

const RATING_BUTTONS: RatingButton[] = [
  { label: 'Again', rating: 1, kbd: '1', className: 'rating-btn--again', aria: 'Again, rating 1 of 4' },
  { label: 'Hard', rating: 3, kbd: '2', className: 'rating-btn--hard', aria: 'Hard, rating 2 of 4' },
  { label: 'Good', rating: 4, kbd: '3', className: 'rating-btn--good', aria: 'Good, rating 3 of 4' },
  { label: 'Easy', rating: 5, kbd: '4', className: 'rating-btn--easy', aria: 'Easy, rating 4 of 4' },
];

const HIDDEN_PAD_MIN = 3;

export default function ReviewCard({
  card,
  phase,
  progress,
  onReveal,
  onRate,
  onSuspended,
  busy = false,
}: ReviewCardProps) {
  const isCloze = card.cardType === 'cloze';
  const backTrimmedEmpty = !isCloze && card.back.trim().length === 0;

  return (
    <section className="review-stage" aria-busy={busy}>
      <div className="review-stage__head">
        <span className="review-progress">
          Card {progress.current} of {progress.total}
        </span>
        <CardFeedbackMenu
          key={card.cardId}
          cardId={card.cardId}
          onSuspended={onSuspended}
        />
      </div>

      <div className="review-stage__prompt">
        {isCloze ? renderCloze(card.front, phase) : <p>{card.front}</p>}
      </div>

      {phase === 'question' && card.hint && (
        <details className="review-stage__hint">
          <summary>Show hint</summary>
          <p className="muted">{card.hint}</p>
        </details>
      )}

      {phase === 'answer' && !isCloze && (
        <div className="review-stage__answer">
          <h3 className="muted">Answer</h3>
          <p>{card.back}</p>
        </div>
      )}

      {backTrimmedEmpty ? (
        <p className="auth-error">(card content unavailable — please file feedback)</p>
      ) : phase === 'question' ? (
        <button type="button" className="btn" onClick={onReveal}>
          Show answer <span className="kbd-hint"><kbd>Space</kbd></span>
        </button>
      ) : (
        <div className="rating-row" role="group" aria-label="Rate this card">
          {RATING_BUTTONS.map((btn) => (
            <button
              key={btn.rating}
              type="button"
              className={`btn ${btn.className}`}
              onClick={() => onRate(btn.rating)}
              disabled={busy}
              aria-label={btn.aria}
            >
              {btn.label} <span className="kbd-hint"><kbd>{btn.kbd}</kbd></span>
            </button>
          ))}
        </div>
      )}

      {process.env.NODE_ENV !== 'production' && (
        <p className="muted review-stage__debug">due {card.dueAt}</p>
      )}
    </section>
  );
}

function renderCloze(input: string, phase: 'question' | 'answer') {
  const segments = parseCloze(input);
  return (
    <p>
      {segments.map((seg, i) => renderSegment(seg, i, phase))}
    </p>
  );
}

function renderSegment(seg: ClozeSegment, i: number, phase: 'question' | 'answer') {
  if (seg.kind === 'text') {
    return <span key={i}>{seg.value}</span>;
  }
  const revealed = phase === 'answer';
  const padded = ' '.repeat(Math.max(HIDDEN_PAD_MIN, seg.answer.length));
  return (
    <span
      key={i}
      className="cloze-blank"
      data-revealed={revealed}
    >
      {revealed ? seg.answer : padded}
    </span>
  );
}
