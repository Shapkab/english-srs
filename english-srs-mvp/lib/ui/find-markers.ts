import type { IssueCategory } from '@/lib/types/domain';

export interface AnnotatedIssue {
  id: string;
  category: IssueCategory;
  errorText: string;
  correctedText: string;
}

export interface Marker {
  start: number;
  end: number;
  issue: AnnotatedIssue;
  index: number;
}

// Locate each issue's errorText in the passage and emit non-overlapping
// markers in document order. Pure: no DOM, no React.
//
// Behavior:
//   - Issues with empty errorText are skipped.
//   - The same errorText occurring at multiple offsets matches once
//     per issue: issue N claims the first free offset; a later issue
//     with the same errorText looks for the next offset.
//   - Overlapping matches: the earlier match wins; the later one is
//     silently dropped.
//   - errorText not found in the passage: that issue contributes
//     nothing.
export function findMarkers(text: string, issues: AnnotatedIssue[]): Marker[] {
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
        markers.push({
          start: at,
          end: at + issue.errorText.length,
          issue,
          index: idx + 1,
        });
        break;
      }
      from = at + 1;
    }
  });
  markers.sort((a, b) => a.start - b.start);
  const cleaned: Marker[] = [];
  for (const m of markers) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && m.start < prev.end) continue;
    cleaned.push(m);
  }
  return cleaned;
}
