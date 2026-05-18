import type { IssueCategory } from '@/lib/types/domain';
import { CATEGORY_COLOR } from '@/lib/ui/category-color';

export interface AnnotatedIssue {
  id: string;
  category: IssueCategory;
  errorText: string;
  correctedText: string;
}

interface AnnotatedPassageProps {
  text: string;
  issues: AnnotatedIssue[];
}

interface Marker {
  start: number;
  end: number;
  issue: AnnotatedIssue;
  index: number;
}

function findMarkers(text: string, issues: AnnotatedIssue[]): Marker[] {
  const used = new Set<string>();
  const markers: Marker[] = [];
  issues.forEach((issue, idx) => {
    if (issue.errorText.trim().length === 0) return;
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(issue.errorText, from);
      if (at < 0) break;
      const key = `${at}:${at + issue.errorText.length}`;
      if (!used.has(key)) {
        used.add(key);
        markers.push({ start: at, end: at + issue.errorText.length, issue, index: idx + 1 });
        break;
      }
      from = at + 1;
    }
  });
  // Sort by start; drop overlaps (keep earlier)
  markers.sort((a, b) => a.start - b.start);
  const cleaned: Marker[] = [];
  for (const m of markers) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && m.start < prev.end) continue;
    cleaned.push(m);
  }
  return cleaned;
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
