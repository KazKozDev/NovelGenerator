/**
 * Finds where each chapter starts in a recorded audiobook. The recognizer (scripts/audio_timecodes.py) only gives the
 * spoken words with their times; this code lines each chapter's heading and opening words up against them.
 */
export type TranscriptWord = [text: string, start: number, end: number];

export interface TimecodeChapter {
  chapter: number;
  title?: string;
  text: string;
}

export interface ChapterTimecode {
  chapter: number;
  /** "Chapter 3: Room 412", as the list and the table show it. */
  label: string;
  /** Seconds from the start of the file, or null when the chapter's opening was not heard. */
  start: number | null;
  /** Share of the heading and opening words found in order at that place, 0..1. */
  score: number;
}

/** How many words of each chapter's opening are looked for, after its heading. */
const OPENING_WORDS = 30;
/** Below this share of the probe heard in order, a place is not taken as the chapter's start. */
const MIN_SCORE = 0.35;
const CANDIDATES_PER_CHAPTER = 6;

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
  один: '1', два: '2', три: '3', четыре: '4', пять: '5', шесть: '6', семь: '7', восемь: '8', девять: '9', десять: '10',
  первая: '1', вторая: '2', третья: '3', четвертая: '4', пятая: '5',
};

/** Words too common to anchor a search on; they still count once a place is being scored. */
const COMMON = new Set(('the a an and of to in on at it is was he she they i you we his her their my your our as for with by ' +
  'that this but or not be had have has from so if then there were are been into out up down no').split(' '));

export function normalizeWord(word: string): string {
  const plain = word.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return NUMBER_WORDS[plain] ?? plain;
}

const tokens = (text: string) => text.split(/[\s—–-]+/).map(normalizeWord).filter(Boolean);

export const chapterLabel = (chapter: TimecodeChapter) =>
  chapter.title && chapter.title.trim() && !/^chapter\s+\d+$/i.test(chapter.title.trim())
    ? `Chapter ${chapter.chapter}: ${chapter.title.trim()}`
    : `Chapter ${chapter.chapter}`;

/** Words of the chapter's heading as a narrator would read it, then the first words of its prose. */
function chapterProbe(chapter: TimecodeChapter): string[] {
  const opening = chapter.text.replace(/^\s*#{1,6}[^\n]*\n/, '').replace(/[*_`>#]/g, ' ');
  return [...tokens(chapterLabel(chapter)), ...tokens(opening).slice(0, OPENING_WORDS)];
}

/** Longest common subsequence of probe and window; returns its length and the window index of its first match. */
function align(probe: string[], heard: string[], from: number, to: number): { length: number; first: number } {
  const n = probe.length, m = to - from;
  // best[i][j]: LCS of probe[i..] and heard[from+j..]; built backwards so the first match can be read off forwards.
  const best: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      best[i][j] = probe[i] === heard[from + j] ? best[i + 1][j + 1] + 1 : Math.max(best[i + 1][j], best[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (probe[i] === heard[from + j]) return { length: best[0][0], first: from + j };
    if (best[i + 1][j] >= best[i][j + 1]) i++;
    else j++;
  }
  return { length: 0, first: from };
}

interface Candidate { at: number; score: number }

function candidates(probe: string[], heard: string[], headingLength: number): Candidate[] {
  if (!probe.length) return [];
  // A search starts where one of the first words of the heading or of the opening was heard.
  const starts = [...probe.slice(0, 4), ...probe.slice(headingLength, headingLength + 6)];
  const anchors = new Set(starts.filter(w => !COMMON.has(w)));
  if (!anchors.size) starts.forEach(w => anchors.add(w));
  const span = Math.round(probe.length * 1.5) + 6;
  const found = new Map<number, number>();
  for (let at = 0; at < heard.length; at++) {
    if (!anchors.has(heard[at])) continue;
    const from = Math.max(0, at - 3);
    const { length, first } = align(probe, heard, from, Math.min(heard.length, from + span));
    const score = length / probe.length;
    if (score >= MIN_SCORE && score > (found.get(first) ?? 0)) found.set(first, score);
  }
  const ranked = [...found].map(([at, score]) => ({ at, score })).sort((a, b) => b.score - a.score || a.at - b.at);
  // Neighbouring starts are the same place found twice; the best of them stands for it.
  const kept: Candidate[] = [];
  for (const c of ranked) {
    if (kept.some(k => Math.abs(k.at - c.at) < probe.length)) continue;
    kept.push(c);
    if (kept.length === CANDIDATES_PER_CHAPTER) break;
  }
  return kept;
}

/**
 * Each chapter's start time in the transcript. Every chapter's likeliest places are found on their own, then the one
 * set of places that keeps the chapters in book order and is heard best overall is taken; a chapter whose opening
 * was never heard keeps start null rather than borrowing a neighbour's place.
 */
export function findChapterTimecodes(words: TranscriptWord[], chapters: TimecodeChapter[]): ChapterTimecode[] {
  const heard: string[] = [], times: number[] = [];
  for (const [text, start] of words) {
    for (const t of tokens(text)) {
      heard.push(t);
      times.push(start);
    }
  }
  const options = chapters.map(c => candidates(chapterProbe(c), heard, tokens(chapterLabel(c)).length));
  // Longest path over (chapter, place) pairs: places must rise with the chapter number; chapters may be skipped.
  const flat = options.flatMap((list, chapter) => list.map(c => ({ chapter, ...c })));
  const total = flat.map(c => c.score), previous = flat.map(() => -1);
  for (let k = 0; k < flat.length; k++)
    for (let p = 0; p < k; p++)
      if (flat[p].chapter < flat[k].chapter && flat[p].at < flat[k].at && total[p] + flat[k].score > total[k]) {
        total[k] = total[p] + flat[k].score;
        previous[k] = p;
      }
  const chosen = new Map<number, Candidate>();
  let k = total.length ? total.indexOf(Math.max(...total)) : -1;
  while (k >= 0) {
    chosen.set(flat[k].chapter, flat[k]);
    k = previous[k];
  }
  return chapters.map((c, index) => {
    const place = chosen.get(index);
    return { chapter: c.chapter, label: chapterLabel(c), start: place ? Math.floor(times[place.at]) : null, score: place ? Math.round(place.score * 100) / 100 : 0 };
  });
}

export function formatTimecode(seconds: number, withHours = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return withHours || h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/**
 * The chapter list for a YouTube description: one "00:00 Chapter 1: …" line per found chapter. YouTube wants the
 * list to begin at 00:00 with chapters of at least ten seconds: a first chapter a few seconds in is moved to 00:00,
 * one starting later is preceded by a line for what comes before it.
 */
export function youtubeChapterList(timecodes: ChapterTimecode[], opening = 'Intro', duration?: number): string {
  const found = timecodes.filter(t => t.start !== null) as (ChapterTimecode & { start: number })[];
  if (!found.length) return '';
  const hours = (duration ?? Math.max(...found.map(t => t.start))) >= 3600;
  const lines = found.map((t, i) => `${formatTimecode(i === 0 && t.start < 10 ? 0 : t.start, hours)} ${t.label}`);
  if (found[0].start >= 10) lines.unshift(`${formatTimecode(0, hours)} ${opening}`);
  return lines.join('\n');
}
