import { describe, it, expect } from 'vitest';
import { findChapterTimecodes, formatTimecode, normalizeWord, youtubeChapterList, type TranscriptWord, type TimecodeChapter } from '../utils/audiobook/chapterTimecodes';

const filler = (seed: number, count: number) =>
  Array.from({ length: count }, (_, i) => ['rain', 'window', 'quiet', 'coffee', 'street', 'paper', 'light', 'door', 'chair', 'voice'][(i * 7 + seed) % 10]).join(' ');

const chapters: TimecodeChapter[] = [
  { chapter: 1, title: 'No Names', text: `Room 412 held the heat of the afternoon long after the sun had moved off the Harrow House facade. ${filler(1, 400)}` },
  { chapter: 2, title: 'Duty to Warn', text: `The first Thursday she went, she said nothing. She had meant to. She had rehearsed it on the walk from Broad Street. ${filler(2, 400)}` },
  { chapter: 3, title: 'Room 412', text: `At 6:45 the gray block was gone. Nora had refreshed the schedule out of habit, the way she checked a stove. ${filler(3, 400)}` },
  { chapter: 4, title: 'The Script', text: `The pages had been on the kitchen table for four days. She had started that first morning with a ruled sheet. ${filler(4, 400)}` },
];

/** Speaks the text as a recognizer would write it down: one word every 0.4 seconds from `at`. */
function speak(text: string, at: number): TranscriptWord[] {
  return text.split(/\s+/).filter(Boolean).map((w, i) => [w, at + i * 0.4, at + i * 0.4 + 0.3]);
}
const end = (words: TranscriptWord[]) => (words.at(-1)?.[2] ?? 0) + 0.5;

describe('findChapterTimecodes', () => {
  it('finds each chapter by its spoken heading and opening, despite recognizer slips', () => {
    const words: TranscriptWord[] = [];
    const add = (text: string) => words.push(...speak(text, end(words)));
    add('The Thursday Room, written by Ann Example, read by the author.');
    const starts: number[] = [];
    // Chapter 1: heading read with the number as a word; opening with one word misheard.
    starts.push(end(words));
    add(`Chapter one. No names. ${chapters[0].text.replace('facade', 'fasad')}`);
    // Chapter 2: heading read as written.
    starts.push(end(words));
    add(`Chapter 2: Duty to Warn. ${chapters[1].text}`);
    // Chapter 3: the narrator skips the heading; the opening alone marks the start. A word is dropped.
    starts.push(end(words));
    add(chapters[2].text.replace('gray ', ''));
    // Chapter 4: heading and opening read normally.
    starts.push(end(words));
    add(`Chapter four, The Script. ${chapters[3].text}`);

    const found = findChapterTimecodes(words, chapters);
    expect(found.map(f => f.label)).toEqual(['Chapter 1: No Names', 'Chapter 2: Duty to Warn', 'Chapter 3: Room 412', 'Chapter 4: The Script']);
    found.forEach((f, i) => {
      expect(f.start).toBe(Math.floor(starts[i]));
      expect(f.score).toBeGreaterThan(0.6);
    });
  });

  it('does not take an earlier quote of a later chapter title as that chapter, and leaves an unheard chapter empty', () => {
    const words: TranscriptWord[] = [];
    const add = (text: string) => words.push(...speak(text, end(words)));
    // Chapter 1 mentions "Room 412", which is also chapter 3's title.
    add(`Chapter 1: No Names. ${chapters[0].text}`);
    const second = end(words);
    add(`Chapter 2: Duty to Warn. ${chapters[1].text}`);
    // Chapter 3 is missing from the recording; chapter 4 follows.
    const fourth = end(words);
    add(`Chapter 4: The Script. ${chapters[3].text}`);

    const found = findChapterTimecodes(words, chapters);
    expect(found[0].start).toBe(0);
    expect(found[1].start).toBe(Math.floor(second));
    expect(found[2].start).toBeNull();
    expect(found[3].start).toBe(Math.floor(fourth));
  });
});

describe('timecode formatting', () => {
  it('normalizes recognizer spellings', () => {
    expect(normalizeWord('Facade,')).toBe('facade');
    expect(normalizeWord('One')).toBe('1');
    expect(normalizeWord('Café')).toBe('cafe');
  });

  it('writes a YouTube chapter list that starts at 00:00', () => {
    expect(formatTimecode(65)).toBe('01:05');
    expect(formatTimecode(3725)).toBe('1:02:05');
    const list = youtubeChapterList([
      { chapter: 1, label: 'Chapter 1: No Names', start: 4, score: 0.9 },
      { chapter: 2, label: 'Chapter 2: Duty to Warn', start: 1300, score: 0.9 },
      { chapter: 3, label: 'Chapter 3: Room 412', start: null, score: 0 },
      { chapter: 4, label: 'Chapter 4: The Script', start: 4000, score: 0.8 },
    ]);
    expect(list).toBe('0:00:00 Chapter 1: No Names\n0:21:40 Chapter 2: Duty to Warn\n1:06:40 Chapter 4: The Script');
    expect(youtubeChapterList([{ chapter: 1, label: 'Chapter 1', start: 30, score: 1 }], 'The Thursday Room')).toBe('00:00 The Thursday Room\n00:30 Chapter 1');
  });
});
