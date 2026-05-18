'use client';

import { Sparkles } from 'lucide-react';
import CardFeedbackMenu from '@/components/CardFeedbackMenu';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { parseCloze, type ClozeSegment } from '@/lib/cards/parse-cloze';
import { CATEGORY_COLOR, CATEGORY_LABEL, isIssueCategory } from '@/lib/ui/category-color';
import { cn } from '@/lib/ui/cn';
import type { ReviewQueueItem } from '@/lib/types/domain';
import type { IssueCategory } from '@/lib/types/domain';
import { useState } from 'react';

interface FlashcardProps {
  card: ReviewQueueItem;
  phase: 'question' | 'answer';
  onSuspended: (cardId: string) => void;
  feedbackOpen: boolean;
  onCloseFeedback: () => void;
}

const TONE_BY_CATEGORY: Record<IssueCategory, BadgeTone> = {
  grammar: 'lavender',
  collocation: 'peach',
  word_form: 'butter',
  article: 'sage',
  preposition: 'rose',
  tense: 'tense',
  word_order: 'order',
  style: 'style',
};

export function Flashcard({ card, phase, onSuspended, feedbackOpen, onCloseFeedback }: FlashcardProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const cat: IssueCategory =
    card.learningTarget && isIssueCategory(card.learningTarget.category)
      ? card.learningTarget.category
      : 'grammar';
  const isCloze = card.cardType === 'cloze';

  return (
    <article
      className={cn(
        'relative w-full max-w-[720px] rounded-[28px] border border-line bg-bg-card p-12 px-14 shadow-lift',
        CATEGORY_COLOR[cat].cls,
      )}
    >
      <div className="absolute left-7 top-6">
        <Badge tone={TONE_BY_CATEGORY[cat]}>{CATEGORY_LABEL[cat]}</Badge>
      </div>
      <div className="absolute right-7 top-7 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        {card.cardType}
      </div>
      <div className="absolute right-7 top-14 lg:top-16">
        <CardFeedbackMenu
          key={card.cardId}
          cardId={card.cardId}
          onSuspended={onSuspended}
          externalOpen={feedbackOpen || undefined}
          onExternalClose={onCloseFeedback}
        />
      </div>

      <div className="min-h-[160px] flex flex-col items-center justify-center text-center mt-6">
        {isCloze ? (
          <p className="font-serif text-[28px] leading-[1.4]">
            {renderCloze(card.front, phase)}
          </p>
        ) : (
          <p className="font-serif text-[28px] leading-[1.4]">{card.front}</p>
        )}
      </div>

      {phase === 'question' && card.hint && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setHintOpen((h) => !h)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-elev px-3 py-1 text-[12px] text-ink-soft hover:bg-bg-sunken"
          >
            <Sparkles size={12} strokeWidth={1.7} />
            {hintOpen ? 'Hide hint' : 'Show hint'}
          </button>
        </div>
      )}
      {hintOpen && card.hint && phase === 'question' && (
        <p className="mt-3 text-center italic text-[14px] text-ink-soft">{card.hint}</p>
      )}

      {phase === 'answer' && !isCloze && card.back.trim().length > 0 && (
        <div className="mt-7 pt-5 border-t border-dashed border-line-strong">
          <p className="font-serif text-[26px] leading-snug text-center">
            <span
              className="px-1.5 py-0.5 rounded-sm"
              style={{ background: 'color-mix(in oklch, var(--sage) 60%, transparent)' }}
            >
              {card.back}
            </span>
          </p>
        </div>
      )}

      {card.learningTarget && (
        <div className="mt-6 text-center font-mono text-[11px] text-ink-faint">
          from target · {card.learningTarget.title} · seen {card.learningTarget.seenCount} times · mastery{' '}
          {card.learningTarget.masteryLevel}/5
        </div>
      )}
    </article>
  );
}

function renderCloze(input: string, phase: 'question' | 'answer') {
  const segments = parseCloze(input);
  return segments.map((seg, i) => renderSegment(seg, i, phase));
}

function renderSegment(seg: ClozeSegment, i: number, phase: 'question' | 'answer') {
  if (seg.kind === 'text') return <span key={i}>{seg.value}</span>;
  const revealed = phase === 'answer';
  return (
    <span
      key={i}
      className="cloze-blank"
      data-revealed={revealed}
      style={{ minWidth: `max(120px, ${Math.max(seg.answer.length, 4) * 0.6}em)` }}
    >
      {revealed ? seg.answer : ' '.repeat(Math.max(3, seg.answer.length))}
    </span>
  );
}

