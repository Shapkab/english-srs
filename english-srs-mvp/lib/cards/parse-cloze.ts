export type ClozeSegment =
  | { kind: 'text'; value: string }
  | { kind: 'cloze'; clozeNumber: number; answer: string };

const ATOM_START_RE = /\{\{c(\d+)::/;
const MAX_CLOZE_NUMBER = 99;

export function parseCloze(input: string): ClozeSegment[] {
  if (input.length === 0) return [];

  const segments: ClozeSegment[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const remainder = input.slice(cursor);
    const atomMatch = ATOM_START_RE.exec(remainder);

    if (!atomMatch || atomMatch.index === undefined) {
      pushText(segments, input.slice(cursor));
      break;
    }

    const atomStart = cursor + atomMatch.index;

    if (atomStart > cursor) {
      pushText(segments, input.slice(cursor, atomStart));
    }

    const innerStart = atomStart + atomMatch[0].length;
    const closeIdx = input.indexOf('}}', innerStart);

    if (closeIdx === -1) {
      pushText(segments, input.slice(atomStart));
      break;
    }

    const clozeNumber = Number.parseInt(atomMatch[1], 10);
    if (!Number.isFinite(clozeNumber) || clozeNumber < 1 || clozeNumber > MAX_CLOZE_NUMBER) {
      pushText(segments, input.slice(atomStart, closeIdx + 2));
      cursor = closeIdx + 2;
      continue;
    }

    const answer = input.slice(innerStart, closeIdx);
    segments.push({ kind: 'cloze', clozeNumber, answer });

    cursor = closeIdx + 2;
  }

  return segments;
}

function pushText(segments: ClozeSegment[], value: string): void {
  if (value.length === 0) return;
  const last = segments[segments.length - 1];
  if (last && last.kind === 'text') {
    last.value += value;
    return;
  }
  segments.push({ kind: 'text', value });
}
