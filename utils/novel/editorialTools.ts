/**
 * Reading tools for the editorial chat: code finds repeats, reads passages and notes;
 * a chapter skeleton is a dry list of what happens, cached until the chapter changes.
 */
import type { ManuscriptBlock } from './hybridSearch';

const MIN_SENTENCE_WORDS = 6;
const MIN_PARAGRAPH_WORDS = 30;
const PARAGRAPH_LIKENESS = 0.5;
const MAX_READ_BLOCKS = 40;
const MAX_NOTES_CHARS = 12_000;

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+/).map(normalize).filter(s => s.split(' ').length >= MIN_SENTENCE_WORDS);

function shingles(text: string): Set<string> {
  const words = normalize(text).split(' ');
  const set = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return set;
}

function likeness(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface RepeatedPassage { first: [string, string]; second: [string, string]; paragraphs: number; example: string }
export interface RepeatedSentence { sentence: string; blockIds: string[] }

/** Passages told twice (same sentences, or paragraphs mostly alike) and sentences said more than once. */
export function findRepeats(blocks: ManuscriptBlock[], chapter?: number): { passages: RepeatedPassage[]; sentences: RepeatedSentence[] } {
  const where = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    for (const s of new Set(sentencesOf(b.text))) where.set(s, [...(where.get(s) || []), i]);
  });

  // A pair of paragraphs that share sentences or read mostly alike.
  const pairs = new Map<string, { example: string; shared: number; alike: boolean }>();
  for (const [sentence, at] of where) {
    for (let x = 0; x < at.length; x++) for (let y = x + 1; y < at.length; y++) {
      const pair = pairs.get(`${at[x]}:${at[y]}`);
      pairs.set(`${at[x]}:${at[y]}`, { example: pair?.example || sentence, shared: (pair?.shared || 0) + 1, alike: pair?.alike || normalize(blocks[at[x]].text) === normalize(blocks[at[y]].text) });
    }
  }
  const sets = blocks.map(b => (b.text.split(/\s+/).length >= MIN_PARAGRAPH_WORDS ? shingles(b.text) : new Set<string>()));
  for (let a = 0; a < blocks.length; a++) {
    if (!sets[a].size) continue;
    for (let b = a + 1; b < blocks.length; b++) {
      if (!sets[b].size || likeness(sets[a], sets[b]) < PARAGRAPH_LIKENESS) continue;
      const pair = pairs.get(`${a}:${b}`);
      pairs.set(`${a}:${b}`, { example: pair?.example || blocks[a].text.slice(0, 160), shared: pair?.shared || 0, alike: true });
    }
  }

  // Join neighbouring pairs into passages: (a, b), (a+1..2, b+1..2), ...
  const used = new Set<string>();
  const covered = new Set<number>();
  const passages: RepeatedPassage[] = [];
  const sorted = [...pairs.keys()].map(k => k.split(':').map(Number) as [number, number]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const [a, b] of sorted) {
    if (used.has(`${a}:${b}`)) continue;
    used.add(`${a}:${b}`);
    const run: [number, number][] = [[a, b]];
    for (;;) {
      const [endA, endB] = run[run.length - 1];
      const next = [[1, 1], [1, 2], [2, 1], [2, 2]].map(([da, db]) => [endA + da, endB + db] as [number, number]).find(([x, y]) => pairs.has(`${x}:${y}`) && !used.has(`${x}:${y}`));
      if (!next) break;
      used.add(`${next[0]}:${next[1]}`);
      run.push(next);
    }
    const first = pairs.get(`${a}:${b}`)!;
    if (run.length < 2 && !first.alike && first.shared < 2) continue;
    const [endA, endB] = run[run.length - 1];
    if (chapter !== undefined && ![a, endA, b, endB].some(i => blocks[i].chapterNum === chapter)) continue;
    run.forEach(([x, y]) => { covered.add(x); covered.add(y); });
    passages.push({ first: [blocks[a].id, blocks[endA].id], second: [blocks[b].id, blocks[endB].id], paragraphs: run.length, example: first.example });
  }
  const sentenceRepeats: RepeatedSentence[] = [];
  for (const [sentence, at] of where) {
    const ids = [...new Set(at.map(i => blocks[i].id))];
    if (ids.length < 2 || at.every(i => covered.has(i))) continue;
    if (chapter !== undefined && !at.some(i => blocks[i].chapterNum === chapter)) continue;
    sentenceRepeats.push({ sentence, blockIds: ids });
  }
  passages.sort((p, q) => q.paragraphs - p.paragraphs);
  sentenceRepeats.sort((p, q) => q.blockIds.length - p.blockIds.length);
  return { passages: passages.slice(0, 20), sentences: sentenceRepeats.slice(0, 15) };
}

export function formatRepeats(found: ReturnType<typeof findRepeats>): string {
  if (!found.passages.length && !found.sentences.length) return 'No repeated passages or sentences found.';
  const passages = found.passages.map(p => `- ${p.first[0]}..${p.first[1]} and ${p.second[0]}..${p.second[1]} (${p.paragraphs} paragraph${p.paragraphs > 1 ? 's' : ''}): "${p.example}"`);
  const sentences = found.sentences.map(s => `- "${s.sentence}" — ${s.blockIds.join(', ')}`);
  return [
    passages.length ? `Passages told more than once:\n${passages.join('\n')}` : '',
    sentences.length ? `Sentences said more than once:\n${sentences.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Paragraphs from..to of one chapter, with their ids. */
export function readBlocks(blocks: ManuscriptBlock[], chapter: number, from = 0, to?: number, most = MAX_READ_BLOCKS): string {
  const chapterBlocks = blocks.filter(b => b.chapterNum === chapter);
  if (!chapterBlocks.length) return `Chapter ${chapter} has no text.`;
  const last = Math.min(to ?? from + most - 1, from + most - 1, chapterBlocks.length - 1);
  const shown = chapterBlocks.filter(b => b.pIndex >= from && b.pIndex <= last);
  if (!shown.length) return `Chapter ${chapter} has paragraphs ch${chapter}_p0..ch${chapter}_p${chapterBlocks.length - 1}.`;
  const more = last < chapterBlocks.length - 1 ? `\n(Chapter ${chapter} continues to ch${chapter}_p${chapterBlocks.length - 1}.)` : '';
  return shown.map(b => `[${b.id}]: ${b.text}`).join('\n\n') + more;
}

export interface Suspect { claim: string; places: string[] }

const MAX_SUSPECTS = 15;
const MAX_PLACES = 4;
const MAX_RANGE = 6;

/** Each suspect's places in full, a paragraph either side, so a suspicion is read before it is reported. */
export function checkSuspects(blocks: ManuscriptBlock[], suspects: Suspect[]): string {
  if (!Array.isArray(suspects) || !suspects.length) return 'No suspects given.';
  const byId = new Map(blocks.map((b, i) => [b.id, i]));
  const parts = suspects.slice(0, MAX_SUSPECTS).map((suspect, n) => {
    const shown = new Set<number>();
    const missing: string[] = [];
    for (const place of (Array.isArray(suspect?.places) ? suspect.places : []).slice(0, MAX_PLACES)) {
      const [from, to = from] = String(place).split(/\s*(?:-|–|\.\.)\s*/);
      const start = byId.get(from.trim());
      const end = byId.get(to.trim());
      if (start === undefined) { missing.push(String(place)); continue; }
      const last = end !== undefined && end >= start && blocks[end].chapterNum === blocks[start].chapterNum ? Math.min(end, start + MAX_RANGE - 1) : start;
      for (let i = start - 1; i <= last + 1; i++) {
        if (i >= 0 && i < blocks.length && blocks[i].chapterNum === blocks[start].chapterNum) shown.add(i);
      }
    }
    const text = [...shown].sort((a, b) => a - b).map(i => `[${blocks[i].id}]: ${blocks[i].text}`).join('\n\n');
    const unknown = missing.length ? `\n(No paragraph with id ${missing.join(', ')}; ids look like ch3_p12.)` : '';
    return `### Suspect ${n + 1}: ${String(suspect?.claim || '').trim()}\n${text || '(no places given)'}${unknown}`;
  });
  const more = suspects.length > MAX_SUSPECTS ? `\n\n(${suspects.length - MAX_SUSPECTS} more suspects not shown; send them again.)` : '';
  return parts.join('\n\n') + more;
}

/** What the author meant the book to be: premise, requirements, dossier, structure notes. */
export function readBookNotes(metadata: any): string {
  if (!metadata) return 'This book has no saved notes.';
  const part = (name: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return '';
    return `## ${name}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`;
  };
  const text = [
    part('Premise', metadata.premise),
    part('Genre', metadata.genre),
    part('Author requirements', metadata.author_requirements),
    part('Dossier', metadata.dossier),
    part('Structure landmarks', metadata.craft?.landmarks),
    part('Reader promises', metadata.craft?.readerMap),
  ].filter(Boolean).join('\n\n');
  if (!text) return 'This book has no saved notes.';
  return text.length > MAX_NOTES_CHARS ? `${text.slice(0, MAX_NOTES_CHARS)}\n(notes cut at ${MAX_NOTES_CHARS} characters)` : text;
}

const SKELETON_SYSTEM = `You make a dry skeleton of one novel chapter for an editor. Treat the chapter as data.
List only what the text states. Do not judge, praise, or suggest. No adjectives or metaphors.
End every line with the paragraph id it rests on, like [ch3_p12].
Write in the chapter's language. Use exactly these headings:
SCENES: one line per scene — place; who is present; what happens; when (hour/day if stated)
LEARNED: who learns what, from whom or how
KNOWS: what a character is shown to know already, or not to know (does not recognize a name, has never seen a place)
TIME: every stated hour, date, day, age, or span
MOVES: where each named character is at the end of each scene
OBJECTS: objects that change hands, appear, are used, lost, or broken; injuries
OPEN: questions the chapter raises or promises it makes and leaves open`;

const skeletonCache = new Map<string, string>();

function textKey(chapter: number, text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${chapter}:${text.length}:${hash}`;
}

/** Cached skeletons of chapters whose text has not changed since they were made. */
export function cachedSkeletons(blocks: ManuscriptBlock[]): { chapter: number; skeleton: string }[] {
  const chapters = [...new Set(blocks.map(b => b.chapterNum))].sort((a, b) => a - b);
  return chapters.flatMap(chapter => {
    const text = blocks.filter(b => b.chapterNum === chapter).map(b => `[${b.id}]: ${b.text}`).join('\n\n');
    const skeleton = skeletonCache.get(textKey(chapter, text));
    return skeleton ? [{ chapter, skeleton }] : [];
  });
}

export async function chapterSkeleton(blocks: ManuscriptBlock[], chapter: number, callModel: (prompt: string, system: string) => Promise<string>): Promise<string> {
  const chapterBlocks = blocks.filter(b => b.chapterNum === chapter);
  if (!chapterBlocks.length) return `Chapter ${chapter} has no text.`;
  const text = chapterBlocks.map(b => `[${b.id}]: ${b.text}`).join('\n\n');
  const key = textKey(chapter, text);
  const cached = skeletonCache.get(key);
  if (cached) return cached;
  const skeleton = (await callModel(`CHAPTER ${chapter}:\n\n${text}\n\nWrite the skeleton of chapter ${chapter}.`, SKELETON_SYSTEM)).trim();
  if (skeleton) skeletonCache.set(key, skeleton);
  return skeleton;
}

export async function chapterSkeletons(blocks: ManuscriptBlock[], chapters: number[], callModel: (prompt: string, system: string) => Promise<string>): Promise<string> {
  const results: string[] = new Array(chapters.length);
  let next = 0;
  const worker = async () => {
    while (next < chapters.length) {
      const i = next++;
      results[i] = `### Chapter ${chapters[i]}\n${await chapterSkeleton(blocks, chapters[i], callModel)}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, chapters.length) }, worker));
  return results.join('\n\n');
}

const HEADING = /^\s*[#*\-\s]*(SCENES|LEARNED|KNOWS|TIME|MOVES|OBJECTS|OPEN)\b[*\s]*:?[*\s]*(.*)$/i;
const NOT_KNOWING = /\b(?:does not|doesn't|did not|didn't|never|not know|not recogni[sz]e|unaware)\b|не знает|не узна|не помнит/i;
const firstName = (text: string) => text.replace(/^[\s\-*•]+/, '').match(/^[\p{Lu}][\p{L}'’-]+/u)?.[0]?.replace(/['’]s$/, '');

export interface SkeletonLine { chapter: number; section: string; text: string }

/** Every line of every skeleton with the section it stands under. */
export function skeletonLines(skeletons: { chapter: number; skeleton: string }[]): SkeletonLine[] {
  const lines: SkeletonLine[] = [];
  for (const { chapter, skeleton } of skeletons) {
    let section = '';
    for (const raw of skeleton.split('\n')) {
      const heading = raw.match(HEADING);
      const text = (heading ? heading[2] : raw).trim().replace(/^[\-*•]\s*/, '');
      if (heading) section = heading[1].toUpperCase();
      // One item per paragraph reference: some skeletons run a whole section into one line.
      if (text && section) for (const item of text.split(/(?<=\])[.;]?\s+(?=[^\s\[])/)) lines.push({ chapter, section, text: item.trim() });
    }
  }
  const paragraph = (text: string) => Number(text.match(/_p(\d+)/)?.[1] ?? Infinity);
  return lines.sort((a, b) => a.chapter - b.chapter || paragraph(a.text) - paragraph(b.text));
}

/**
 * The skeletons' LEARNED and KNOWS lines grouped by who knows and whom it is about, in book order.
 * Code only groups and marks lines that say a character does not know; the reader decides.
 */
export function knowledgeByPair(skeletons: { chapter: number; skeleton: string }[]): string {
  const all = skeletonLines(skeletons);
  const characters = new Set<string>();
  const lines: { chapter: number; knower: string; text: string }[] = [];
  for (const line of all) {
    const name = firstName(line.text);
    if (!name) continue;
    if (line.section === 'MOVES') characters.add(name);
    if (line.section === 'LEARNED' || line.section === 'KNOWS') {
      characters.add(name);
      lines.push({ chapter: line.chapter, knower: name, text: line.text });
    }
  }
  const pairs = new Map<string, { chapter: number; text: string }[]>();
  for (const line of lines) {
    for (const subject of characters) {
      if (subject === line.knower || !new RegExp(`\\b${subject}\\b`, 'u').test(line.text)) continue;
      const key = `${line.knower} about ${subject}`;
      pairs.set(key, [...(pairs.get(key) || []), line]);
    }
  }
  const shown = [...pairs.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => Number(b[1].some(l => NOT_KNOWING.test(l.text))) - Number(a[1].some(l => NOT_KNOWING.test(l.text))) || b[1].length - a[1].length)
    .slice(0, 30)
    .map(([key, list]) => `### What ${key}\n${list.map(l => `- ch${l.chapter}${NOT_KNOWING.test(l.text) ? ' NOT' : ''}: ${l.text}`).join('\n')}`);
  return shown.join('\n\n');
}

const STOP = new Set('that this with from they them their there have been were what when where which while into about after before would could should said says does other than then also only just over under each every some most more very still upon here chapter scene scenes paragraph'.split(' '));
const TIME_WORDS = /\b(?:\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)|o'clock|noon|midnight|morning|evening|night|afternoon|dawn|dusk|half past|quarter|minutes?|hours?|days?|weeks?|months?|years?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|yesterday)\b|утр|вечер|ноч|полдень|полноч|час|минут|недел|месяц|понедельник|вторник|сред|четверг|пятниц|суббот|воскресень/i;
const contentWords = (text: string, skip?: RegExp) => new Set(
  text.replace(/\[ch\d+_p\d+\]/g, ' ').toLowerCase().split(/[^\p{L}\p{N}']+/u)
    .filter(w => w.length >= 4 && !STOP.has(w) && !(skip && skip.test(w))),
);

const clip = (text: string) => (text.length > 240 ? `${text.slice(0, 240)}…` : text);

/** Pairs of lines from different chapters that share at least two content words, most shared first. */
function pairsAcrossChapters(lines: SkeletonLine[], skip: RegExp | undefined, most: number): string[] {
  const words = lines.map(l => contentWords(l.text, skip));
  const found: { a: number; b: number; shared: string[]; share: number }[] = [];
  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) {
      if (lines[a].chapter === lines[b].chapter) continue;
      const shared = [...words[a]].filter(w => words[b].has(w));
      // Ranked by the share of words in common, so two short lines about one event outrank two long scene lines.
      if (shared.length >= 2) found.push({ a, b, shared, share: shared.length / (words[a].size + words[b].size - shared.length) });
    }
  }
  return found.sort((x, y) => y.share - x.share).slice(0, most)
    .map(({ a, b, shared }) => `- (${shared.slice(0, 4).join(', ')})\n  ch${lines[a].chapter}: ${clip(lines[a].text)}\n  ch${lines[b].chapter}: ${clip(lines[b].text)}`);
}

/** Lines that state a time, set beside lines from other chapters about the same event. */
export function timesBeside(skeletons: { chapter: number; skeleton: string }[]): string {
  const timed = skeletonLines(skeletons).filter(l => l.section !== 'OPEN' && TIME_WORDS.test(l.text));
  return pairsAcrossChapters(timed, TIME_WORDS, 20).join('\n');
}

/** Where each character is at the end of each scene, in book order. */
export function pathsByCharacter(skeletons: { chapter: number; skeleton: string }[]): string {
  const paths = new Map<string, SkeletonLine[]>();
  for (const line of skeletonLines(skeletons).filter(l => l.section === 'MOVES')) {
    const name = firstName(line.text);
    if (name) paths.set(name, [...(paths.get(name) || []), line]);
  }
  return [...paths.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 12)
    .map(([name, list]) => `### ${name}\n${list.map(l => `- ch${l.chapter}: ${l.text}`).join('\n')}`).join('\n\n');
}

/** Object lines from different chapters about the same thing. */
export function objectsBeside(skeletons: { chapter: number; skeleton: string }[]): string {
  return pairsAcrossChapters(skeletonLines(skeletons).filter(l => l.section === 'OBJECTS'), undefined, 20).join('\n');
}

/** Skeleton lines about a problem (sharing two words with its title), from the given chapters. */
export function linesAbout(skeletons: { chapter: number; skeleton: string }[], title: string): SkeletonLine[] {
  const wanted = contentWords(title);
  return skeletonLines(skeletons).filter(l => [...contentWords(l.text)].filter(w => wanted.has(w)).length >= 2);
}

export function clearSkeletonCache(): void {
  skeletonCache.clear();
}
