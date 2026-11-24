/**
 * Reading tools for the editorial chat: code finds repeats, reads passages and notes;
 * a chapter skeleton is a dry list of what happens, cached until the chapter changes.
 */
import type { ManuscriptBlock } from './hybridSearch';
import { keysOf, parseRecords, RECORDS_SYSTEM, recordsPrompt, renderRecords, type ChapterRecords } from './chapterRecords';

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

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12,
};
const UNIT_DAYS: [RegExp, number][] = [[/^(day|days|день|дня|дней)$/i, 1], [/^(week|weeks|неделя|недели|недель|неделю)$/i, 7], [/^(month|months|месяц|месяца|месяцев)$/i, 30], [/^(year|years|год|года|лет)$/i, 365]];
const DURATION = /\b(a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)[\s-]+(days?|weeks?|months?|years?|день|дня|дней|неделя|недели|недель|неделю|месяц|месяца|месяцев|год|года|лет)\b/giu;
const DURATION_STOP = new Set('that this with from they them their there have been were what when where which while into about after before would could should said says does other than then also only just over under each every some more very still upon here since last ago long'.split(' '));

export interface DurationMention { id: string; sentence: string; phrase: string; days: number }

/** Every stated span of time (eleven weeks, just over a year, sixteen years), with its sentence and paragraph. */
export function durationMentions(blocks: ManuscriptBlock[]): DurationMention[] {
  const mentions: DurationMention[] = [];
  for (const b of blocks) {
    for (const sentence of b.text.split(/(?<=[.!?…])\s+/)) {
      for (const m of sentence.matchAll(DURATION)) {
        // "a week ago" is a moment and "a nineteen-year-old" an age, not a span.
        const after = sentence.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 6);
        if (/^\s*ago\b|^-?old\b|^\s+old\b|^\s*назад/i.test(after) || /-$/.test(sentence.slice(0, m.index ?? 0))) continue;
        const count = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
        const unit = UNIT_DAYS.find(([pattern]) => pattern.test(m[2]))?.[1];
        if (count && unit) mentions.push({ id: b.id, sentence: sentence.trim(), phrase: m[0], days: count * unit });
      }
    }
  }
  return mentions;
}

const spanWords = (sentence: string) => new Set(sentence.replace(DURATION, ' ').toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(w => w.length >= 4 && !DURATION_STOP.has(w)));

/** Two spans in different paragraphs whose sentences share three words or more but whose lengths differ at least twofold. */
export function durationSuspects(mentions: DurationMention[], most = 5): Suspect[] {
  const found: { a: DurationMention; b: DurationMention; shared: number }[] = [];
  for (let i = 0; i < mentions.length; i++) for (let j = i + 1; j < mentions.length; j++) {
    const [a, b] = [mentions[i], mentions[j]];
    if (a.id === b.id || Math.max(a.days, b.days) / Math.min(a.days, b.days) < 2) continue;
    const [x, y] = [spanWords(a.sentence), spanWords(b.sentence)];
    const shared = [...x].filter(w => y.has(w)).length;
    if (shared >= 3) found.push({ a, b, shared });
  }
  return found.sort((p, q) => q.shared - p.shared).slice(0, most).map(({ a, b }) => ({
    claim: `Two spans for what may be one thing: "${a.phrase}" (${a.id}) and "${b.phrase}" (${b.id})`,
    places: [a.id, b.id],
  }));
}

/** The spans in book order, for a reader to set side by side. */
export function formatDurations(mentions: DurationMention[]): string {
  const clip = (text: string) => (text.length > 200 ? `${text.slice(0, 200)}…` : text);
  return mentions.map(m => `- ${m.id} "${m.phrase}": ${clip(m.sentence)}`).join('\n');
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

// A skeleton is made from the chapter's records (JSON); a reply that is not JSON is kept as plain text.
const skeletonCache = new Map<string, { skeleton: string; records?: ChapterRecords }>();

function textKey(chapter: number, text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${chapter}:${text.length}:${hash}`;
}

const chapterText = (blocks: ManuscriptBlock[], chapter: number) =>
  blocks.filter(b => b.chapterNum === chapter).map(b => `[${b.id}]: ${b.text}`).join('\n\n');

function cached(blocks: ManuscriptBlock[]): { chapter: number; skeleton: string; records?: ChapterRecords }[] {
  const chapters = [...new Set(blocks.map(b => b.chapterNum))].sort((a, b) => a - b);
  return chapters.flatMap(chapter => {
    const entry = skeletonCache.get(textKey(chapter, chapterText(blocks, chapter)));
    return entry ? [{ chapter, ...entry }] : [];
  });
}

/** Cached skeletons of chapters whose text has not changed since they were made. */
export function cachedSkeletons(blocks: ManuscriptBlock[]): { chapter: number; skeleton: string }[] {
  return cached(blocks).map(({ chapter, skeleton }) => ({ chapter, skeleton }));
}

/** Cached records of chapters whose text has not changed, for the checks in code. */
export function cachedRecords(blocks: ManuscriptBlock[]): ChapterRecords[] {
  return cached(blocks).flatMap(entry => (entry.records ? [entry.records] : []));
}

export async function chapterSkeleton(blocks: ManuscriptBlock[], chapter: number, callModel: (prompt: string, system: string) => Promise<string>): Promise<string> {
  const text = chapterText(blocks, chapter);
  if (!text) return `Chapter ${chapter} has no text.`;
  const key = textKey(chapter, text);
  const hit = skeletonCache.get(key);
  if (hit) return hit.skeleton;
  // Earlier chapters' keys, so the same event, fact, or object keeps one name across the book.
  const known = keysOf(cached(blocks).filter(c => c.chapter < chapter).flatMap(c => (c.records ? [c.records] : [])));
  const reply = (await callModel(recordsPrompt(chapter, text, known), RECORDS_SYSTEM)).trim();
  const records = parseRecords(reply);
  const skeleton = records ? renderRecords(records) : reply;
  if (skeleton) skeletonCache.set(key, { skeleton, records });
  return skeleton;
}

/** Skeletons in chapter order, one after another, so each chapter reuses the keys of the ones before. */
export async function chapterSkeletons(blocks: ManuscriptBlock[], chapters: number[], callModel: (prompt: string, system: string) => Promise<string>): Promise<string> {
  const results: string[] = [];
  for (const chapter of [...chapters].sort((a, b) => a - b)) results.push(`### Chapter ${chapter}\n${await chapterSkeleton(blocks, chapter, callModel)}`);
  return results.join('\n\n');
}

const HEADING = /^\s*[#*\-\s]*(SCENES|LEARNED|KNOWS|TIME|MOVES|OBJECTS|OPEN)\b[*\s]*:?[*\s]*(.*)$/i;

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

const NOT_KNOWING = /\b(?:does not|doesn't|did not|didn't|never|not know|not recogni[sz]e|unaware)\b|не знает|не узна|не помнит/i;
const firstName = (text: string) => text.replace(/^[\s\-*•]+/, '').match(/^[\p{Lu}][\p{L}'’-]+/u)?.[0]?.replace(/['’]s$/, '');

/**
 * The skeletons' LEARNED and KNOWS lines grouped by who knows and whom it is about, in book order.
 * Code only groups and marks lines that say a character does not know; the reader decides.
 */
export function knowledgeByPair(skeletons: { chapter: number; skeleton: string }[]): string {
  const characters = new Set<string>();
  const lines: { chapter: number; knower: string; text: string }[] = [];
  for (const line of skeletonLines(skeletons)) {
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
  return [...pairs.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => Number(b[1].some(l => NOT_KNOWING.test(l.text))) - Number(a[1].some(l => NOT_KNOWING.test(l.text))) || b[1].length - a[1].length)
    .slice(0, 30)
    .map(([key, list]) => `### What ${key}\n${list.map(l => `- ch${l.chapter}${NOT_KNOWING.test(l.text) ? ' NOT' : ''}: ${l.text}`).join('\n')}`)
    .join('\n\n');
}

const STOP = new Set('that this with from they them their there have been were what when where which while into about after before would could should said says does other than then also only just over under each every some most more very still upon here chapter scene scenes paragraph knows learns'.split(' '));
const contentWords = (text: string) => new Set(
  text.replace(/\[ch\d+_p\d+\]/g, ' ').toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(w => w.length >= 4 && !STOP.has(w)),
);

/** Skeleton lines about a problem (sharing two words with its title), from the given chapters. */
export function linesAbout(skeletons: { chapter: number; skeleton: string }[], title: string): SkeletonLine[] {
  const wanted = contentWords(title);
  return skeletonLines(skeletons).filter(l => [...contentWords(l.text)].filter(w => wanted.has(w)).length >= 2);
}

export function clearSkeletonCache(): void {
  skeletonCache.clear();
}
