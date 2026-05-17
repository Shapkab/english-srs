import { describe, expect, it } from 'vitest';
import { parseCloze } from '@/lib/cards/parse-cloze';

describe('parseCloze', () => {
  it('returns a single text segment for plain text', () => {
    expect(parseCloze('hello world')).toEqual([{ kind: 'text', value: 'hello world' }]);
  });

  it('parses a single atom surrounded by text', () => {
    expect(parseCloze('In English we say {{c1::went}} not goed.')).toEqual([
      { kind: 'text', value: 'In English we say ' },
      { kind: 'cloze', clozeNumber: 1, answer: 'went' },
      { kind: 'text', value: ' not goed.' },
    ]);
  });

  it('parses multiple atoms with different numbers, including a two-digit number', () => {
    const result = parseCloze('A {{c1::X}} B {{c2::Y}} C {{c12::Z}} D');
    expect(result).toEqual([
      { kind: 'text', value: 'A ' },
      { kind: 'cloze', clozeNumber: 1, answer: 'X' },
      { kind: 'text', value: ' B ' },
      { kind: 'cloze', clozeNumber: 2, answer: 'Y' },
      { kind: 'text', value: ' C ' },
      { kind: 'cloze', clozeNumber: 12, answer: 'Z' },
      { kind: 'text', value: ' D' },
    ]);
  });

  it('renders an empty cloze as an empty answer', () => {
    expect(parseCloze('blank: {{c1::}} done')).toEqual([
      { kind: 'text', value: 'blank: ' },
      { kind: 'cloze', clozeNumber: 1, answer: '' },
      { kind: 'text', value: ' done' },
    ]);
  });

  it('emits the entire substring as text when a cloze is unclosed', () => {
    expect(parseCloze('hello {{c1::abc and more')).toEqual([
      { kind: 'text', value: 'hello {{c1::abc and more' },
    ]);
  });

  it('emits a single text segment for a bare unclosed cloze', () => {
    expect(parseCloze('{{c1::abc')).toEqual([
      { kind: 'text', value: '{{c1::abc' },
    ]);
  });

  it('treats a stray {{ without cN:: as plain text', () => {
    expect(parseCloze('this {{ is literal }} text')).toEqual([
      { kind: 'text', value: 'this {{ is literal }} text' },
    ]);
  });

  it('keeps a single } inside the inner segment as part of the answer', () => {
    expect(parseCloze('{{c1::a}b}}rest')).toEqual([
      { kind: 'cloze', clozeNumber: 1, answer: 'a}b' },
      { kind: 'text', value: 'rest' },
    ]);
  });

  it('preserves whitespace-only input as a single text segment', () => {
    expect(parseCloze('   ')).toEqual([{ kind: 'text', value: '   ' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseCloze('')).toEqual([]);
  });
});
