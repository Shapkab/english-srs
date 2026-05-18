import { CATEGORY_COLOR } from '@/lib/ui/category-color';
import { findMarkers, type AnnotatedIssue } from '@/lib/ui/find-markers';

export type { AnnotatedIssue };

interface AnnotatedPassageProps {
  text: string;
  issues: AnnotatedIssue[];
}

export function AnnotatedPassage({ text, issues }: AnnotatedPassageProps) {
  const markers = findMarkers(text, issues);
  if (markers.length === 0) {
    return <p className="font-serif text-[24px] leading-[1.6] whitespace-pre-wrap">{text}</p>;
  }
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  markers.forEach((m, idx) => {
    if (m.start > cursor) {
      nodes.push(<span key={`t-${idx}`}>{text.slice(cursor, m.start)}</span>);
    }
    const color = CATEGORY_COLOR[m.issue.category];
    nodes.push(
      <span key={`a-${idx}`} className={color?.cls ?? ''}>
        <span className="ann">
          {m.issue.errorText}
          <sup>{m.index}</sup>
        </span>
        {m.issue.correctedText && (
          <>
            {' '}
            <span className="insert">{m.issue.correctedText}</span>
          </>
        )}
      </span>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }
  return <p className="font-serif text-[24px] leading-[1.6] whitespace-pre-wrap">{nodes}</p>;
}
