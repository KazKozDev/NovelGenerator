/**
 * What the book owes the reader, counted from the author's own words.
 *
 * Acts are divided by the chapter count. The author names each debt. A debt
 * is met when the words after the bar stand in the chapter that owes them.
 * A clock belongs to the last chapter and is met when that chapter agrees
 * with who was where, at that hour, with that thing. The irony's correction
 * has to be that chapter's ending. A debt already found on the page stays
 * owed if its line is later deleted. While calls remain, done does not close
 * a book that still owes one.
 */

export interface ActSpan {
  act: 1 | 2 | 3;
  from: number;
  to: number;
}

export type DebtKind = 'turn' | 'question' | 'stake' | 'gun' | 'decisive' | 'false' | 'irony' | 'want' | 'need' | 'learn' | 'clock' | 'waiting' | 'plant';

export interface Held {
  kind: DebtKind;
  /** Which act a turn or a stake belongs to. */
  act?: 1 | 2 | 3;
  plant: string;
  pay: string;
  /** Third beat: the correction, for irony. */
  note?: string;
  plantBy: number;
  fireBy: number;
  planted: number;
  fired: number;
  paySeen: number;
  /** What the page almost did, when the debt is still open. */
  near?: string;
}

export interface DramaSources {
  inserts?: { file: string; kind: string; text: string }[];
  waiting?: { text: string; afterChapter: number };
}

const STOP = new Set('the a an and or but in on at to for of with by from as is was were be been being his her its their she her he him they them that this these those into over under out about than then just only very what when who whom which whose after before again'.split(' '));

/** Code owns the acts. A model asked to divide a book invents a shape the chapter count does not have. */
export function actSpans(chapters: number): ActSpan[] {
  const n = Math.max(1, Math.floor(chapters));
  if (n === 1) return [{ act: 1, from: 1, to: 1 }, { act: 2, from: 1, to: 1 }, { act: 3, from: 1, to: 1 }];
  if (n === 2) return [{ act: 1, from: 1, to: 1 }, { act: 2, from: 2, to: 2 }, { act: 3, from: 2, to: 2 }];
  const head = Math.max(1, Math.round(n * 0.25));
  let last = n - Math.max(1, Math.round(n * 0.25)) + 1;
  if (last < head + 2) last = Math.min(n, head + 2);
  return [
    { act: 1, from: 1, to: head },
    { act: 2, from: head + 1, to: Math.max(head + 1, last - 1) },
    { act: 3, from: last, to: n },
  ];
}

export const contentWords = (phrase: string): string[] =>
  phrase.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(word => word.length >= 3 && !STOP.has(word));

const stem = (word: string): string => word.replace(/(?:ing|ed|es|s)$/, '');

const same = (token: string, word: string): boolean => {
  const left = stem(token), right = stem(word);
  return left.length >= 3 && left === right;
};

const sentencesOf = (text: string): string[] => text.split(/[.!?\n]+/).map(sentence => sentence.trim()).filter(Boolean);

/** The phrase is on the page when its content words stand, in order, inside one sentence. */
export function phraseIn(text: string, phrase: string): boolean {
  return locateSentence(text, phrase) >= 0;
}

function locateSentence(text: string, phrase: string): number {
  const need = contentWords(phrase);
  const sentences = sentencesOf(text);
  if (!need.length) {
    const flat = phrase.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (flat.length < 4) return -1;
    return sentences.findIndex(sentence => sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').includes(flat));
  }
  return sentences.findIndex(sentence => {
    const tokens = sentence.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').split(/\s+/).filter(Boolean);
    for (let start = 0; start < tokens.length; start++) {
      if (!same(tokens[start], need[0])) continue;
      let at = start, ok = true;
      for (let index = 1; index < need.length; index++) {
        const found = tokens.slice(at + 1, at + 12).findIndex(token => same(token, need[index]));
        if (found < 0) { ok = false; break; }
        at += 1 + found;
      }
      if (ok) return true;
    }
    return false;
  });
}

const clamp = (value: number, chapters: number) => Math.min(chapters, Math.max(1, value));

const blank = (partial: Omit<Held, 'planted' | 'fired' | 'paySeen'>): Held => ({ ...partial, planted: 0, fired: 0, paySeen: 0 });

const usable = (phrase: string) => contentWords(phrase).length >= 2 || phrase.replace(/[^\p{L}\p{N}]+/gu, '').length >= 4;

export function readDrama(text: string, chapters: number): { held: Held[]; unread: string[] } {
  const spans = actSpans(chapters);
  const actOf = (n: 1 | 2 | 3) => spans.find(span => span.act === n)!;
  const held: Held[] = [];
  const unread: string[] = [];
  const parts = (body: string) => body.split('|').map(part => part.trim()).filter(Boolean);
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^((?:TURN|STAKE)\s*[123])\s*\((?:ch(?:apter)?\.?|chapters?)\s*\d+(?:\s*[-–]\s*\d+)?\)\s*:/i, '$1:');
    if (!line || /^#{1,3}\s/.test(line) || /^title\s*:/i.test(line)) continue;
    const turn = line.match(/^TURN\s*([123])\s*:\s*(.+)$/i);
    const question = line.match(/^QUESTION\s*:\s*(.+)$/i);
    const stake = line.match(/^STAKE(?:\s*([123]))?\s*:\s*(.+)$/i);
    const gun = line.match(/^GUN\s*:\s*(.+)$/i);
    const decisive = line.match(/^DECISIVE\s*:\s*(.+)$/i);
    const fake = line.match(/^FALSE\s*:\s*(.+)$/i);
    const irony = line.match(/^IRONY\s*:\s*(.+)$/i);
    const want = line.match(/^WANT\s*:\s*(.+)$/i);
    const need = line.match(/^NEED\s*:\s*(.+)$/i);
    const learn = line.match(/^LEARN\s*(\d+)\s*:\s*(.+)$/i);
    if (turn) {
      const phrase = turn[2].trim();
      const act = Number(turn[1]) as 1 | 2 | 3;
      const span = actOf(act);
      if (!usable(phrase)) unread.push(line);
      else held.push(blank({ kind: 'turn', act, plant: phrase, pay: phrase, plantBy: span.from, fireBy: span.to }));
    } else if (question) {
      const [ask, answer] = parts(question[1]);
      if (!ask || !answer) unread.push(line);
      else held.push(blank({ kind: 'question', plant: ask, pay: answer, plantBy: actOf(1).to, fireBy: chapters }));
    } else if (stake) {
      const act = stake[1] ? Number(stake[1]) as 1 | 2 | 3 : undefined;
      const [risk, loss, at] = parts(stake[2].replace(/\bRealized\s*:/i, '|'));
      const span = act ? actOf(act) : undefined;
      const by = span ? span.to : at && /^\d+$/.test(at) ? clamp(Number(at), chapters) : actOf(2).to;
      const from = span ? span.from : actOf(1).to;
      if (!risk || !loss || (!span && by < from)) unread.push(line);
      else held.push(blank({ kind: 'stake', act, plant: risk, pay: loss, plantBy: from, fireBy: by }));
    } else if (gun) {
      const [plant, pay, from, to] = parts(gun[1]);
      const chapterNumber = (value: string | undefined) => value?.match(/^(?:(?:plant|payoff)\s+)?(?:ch(?:apter)?\.?\s*)?(\d+)\.?$/i)?.[1];
      const plantBy = chapterNumber(from) ? clamp(Number(chapterNumber(from)), chapters) : actOf(1).to;
      const fireBy = chapterNumber(to) ? clamp(Number(chapterNumber(to)), chapters) : chapters;
      if (!plant || !pay || (fireBy <= plantBy && chapters > 1)) unread.push(line);
      else held.push(blank({ kind: 'gun', plant, pay, plantBy, fireBy }));
    } else if (decisive) {
      const phrase = decisive[1].trim();
      if (!usable(phrase)) unread.push(line);
      else held.push(blank({ kind: 'decisive', plant: phrase, pay: phrase, plantBy: chapters, fireBy: chapters }));
    } else if (fake) {
      const [win, cost] = parts(fake[1]);
      const span = actOf(2);
      const plantBy = chapters > 1 ? Math.min(span.from, chapters - 1) : 1;
      if (!win || !cost) unread.push(line);
      else held.push(blank({ kind: 'false', plant: win, pay: cost, plantBy, fireBy: chapters }));
    } else if (irony) {
      const [fact, belief, correction] = parts(irony[1]);
      if (!fact || !belief || !correction) unread.push(line);
      else held.push(blank({ kind: 'irony', plant: fact, pay: belief, note: correction, plantBy: actOf(1).to, fireBy: chapters }));
    } else if (want) {
      const phrase = want[1].trim();
      if (!usable(phrase)) unread.push(line);
      else held.push(blank({ kind: 'want', plant: phrase, pay: phrase, plantBy: actOf(1).from, fireBy: actOf(1).to }));
    } else if (need) {
      const phrase = need[1].trim();
      if (!usable(phrase)) unread.push(line);
      else held.push(blank({ kind: 'need', plant: phrase, pay: phrase, plantBy: actOf(3).from, fireBy: chapters }));
    } else if (learn) {
      const chapter = clamp(Number(learn[1]), chapters);
      const phrase = learn[2].trim();
      if (!usable(phrase)) unread.push(line);
      else held.push(blank({ kind: 'learn', plant: phrase, pay: phrase, plantBy: chapter, fireBy: chapter }));
    } else unread.push(line);
  }
  return { held, unread };
}

/** Lines without which a chapter is not stored. Clocks, plants and a reader's waiting are debts only once they exist. */
export function missingShape(held: Held[], chapters: number): string[] {
  const missing: string[] = [];
  for (const span of actSpans(chapters)) {
    if (!held.some(item => item.kind === 'turn' && item.act === span.act)) missing.push(`TURN ${span.act}`);
    if (!held.some(item => item.kind === 'stake' && item.act === span.act)) missing.push(`STAKE ${span.act}`);
  }
  if (!held.some(item => item.kind === 'question')) missing.push('QUESTION: what is asked | what answers it');
  if (!held.some(item => item.kind === 'gun')) missing.push('GUN: what is set down | what uses it | chapter | chapter');
  if (!held.some(item => item.kind === 'decisive')) missing.push('DECISIVE: the protagonist\'s last act');
  if (!held.some(item => item.kind === 'false')) missing.push('FALSE: the win that will not hold | the cost that follows it');
  if (!held.some(item => item.kind === 'irony')) missing.push('IRONY: what the reader is shown | what a character believes | the correction');
  if (!held.some(item => item.kind === 'want')) missing.push('WANT: what the protagonist pursues');
  if (!held.some(item => item.kind === 'need')) missing.push('NEED: what it actually costs');
  for (let chapter = 1; chapter <= chapters; chapter++) if (!held.some(item => item.kind === 'learn' && item.fireBy === chapter)) missing.push(`LEARN ${chapter}: what the reader learns here for the first time`);
  const want = held.find(item => item.kind === 'want');
  const need = held.find(item => item.kind === 'need');
  if (want && need && contentWords(want.plant).join(' ') === contentWords(need.plant).join(' ')) missing.push('NEED must name a different debt from WANT');
  return missing;
}

const chaptersOf = (files: Record<string, string>, chapters: number): string[] =>
  Array.from({ length: chapters }, (_, index) => files[`chapter-${index + 1}.md`] || '');

const firstIn = (texts: string[], phrase: string, accept: (chapter: number, sentence: string) => boolean = () => true): number => {
  const at = texts.findIndex((text, index) => {
    const sentenceAt = locateSentence(text, phrase);
    return sentenceAt >= 0 && accept(index + 1, sentencesOf(text)[sentenceAt] || '');
  });
  return at < 0 ? 0 : at + 1;
};

const different = (plant: string, pay: string) => contentWords(plant).join(' ') !== contentWords(pay).join(' ');

const tokensOf = (sentence: string) => sentence.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').split(/\s+/).filter(Boolean);
const hasWord = (sentence: string, word: string) => tokensOf(sentence).some(token => same(token, word));
const shareCount = (sentence: string, words: string[]) => words.filter(word => hasWord(sentence, word)).length;

/** The last chapter agrees with a clock line when its people, place and thing are there and no sentence about them names another hour. */
function clockAgrees(chapter: string, phrase: string, time: string): { ok: boolean; clash: string } {
  const words = contentWords(phrase);
  const sentences = sentencesOf(chapter);
  const missing = words.filter(word => !sentences.some(sentence => hasWord(sentence, word)));
  const clockTime = time.toLowerCase().replace(/\s+/g, '').replace('.', ':');
  if (clockTime) {
    for (const sentence of sentences) {
      if (shareCount(sentence, words) < 2) continue;
      const stated = sentence.match(/\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*[ap]\.?m\.?\b/gi) || [];
      if (stated.some(found => found.toLowerCase().replace(/\s+/g, '').replace('.', ':') !== clockTime)) return { ok: false, clash: sentence };
    }
  }
  return { ok: missing.length === 0, clash: '' };
}

/** The sentence in the owed chapters that came closest, and the words it still lacks. */
function hint(texts: string[], phrase: string, from: number, to: number): string {
  const need = contentWords(phrase);
  if (!need.length || from > to) return '';
  let bestScore = 0, bestChapter = 0, bestSentence = '';
  for (let chapter = from; chapter <= to; chapter++) {
    for (const sentence of sentencesOf(texts[chapter - 1] || '')) {
      const score = shareCount(sentence, need);
      if (score > bestScore) { bestScore = score; bestChapter = chapter; bestSentence = sentence; }
    }
  }
  if (!bestScore) return '';
  const missing = need.filter(word => !hasWord(bestSentence, word));
  if (!missing.length) return '';
  return `Nearest in chapter ${bestChapter}: "${bestSentence.slice(0, 160)}". Still missing: ${missing.join(', ')}.`;
}

function clockLines(envelope: string, chapters: number): Held[] {
  const held: Held[] = [];
  for (const raw of envelope.split('\n')) {
    const line = raw.trim();
    if (!line || !/\b\d{1,2}[:.]\d{2}\b|\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(line)) continue;
    const time = line.match(/\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*[ap]\.?m\.?\b/i)?.[0] || '';
    const phrase = line.replace(/\b\d{1,2}[:.]\d{2}\b|(?:\d{1,2}\s*)?(?:a\.?m\.?|p\.?m\.?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (contentWords(phrase).length < 2) continue;
    held.push(blank({ kind: 'clock', plant: phrase, pay: time || phrase, plantBy: chapters, fireBy: chapters }));
  }
  return held;
}

function plantLines(inserts: DramaSources['inserts'], chapters: number): Held[] {
  return (inserts || []).filter(insert => insert.kind === 'plant' && contentWords(insert.text).length >= 2).map(insert => {
    const chapter = Number(insert.file.match(/chapter-(\d+)/)?.[1] || 1);
    return blank({ kind: 'plant', plant: insert.text.trim(), pay: insert.text.trim(), plantBy: chapter, fireBy: chapters });
  });
}

function waitingLine(waiting: DramaSources['waiting'], chapters: number): Held[] {
  if (!waiting) return [];
  const phrase = contentWords(waiting.text).slice(0, 6).join(' ');
  if (contentWords(phrase).length < 3) return [];
  return [blank({ kind: 'waiting', plant: phrase, pay: phrase, plantBy: Math.max(1, waiting.afterChapter), fireBy: chapters })];
}

export function seeDrama(held: Held[], files: Record<string, string>, chapters: number): Held[] {
  const texts = chaptersOf(files, chapters);
  const spans = actSpans(chapters);
  const seen = held.map(item => {
    const planted = firstIn(texts, item.plant);
    const paySeen = firstIn(texts, item.pay);
    const same = !different(item.plant, item.pay);
    let fired = 0;
    if (item.kind === 'turn') fired = firstIn(texts, item.plant, chapter => chapter >= item.plantBy && chapter <= item.fireBy);
    else if (item.kind === 'want') fired = firstIn(texts, item.plant, chapter => chapter >= item.plantBy && chapter <= item.fireBy);
    else if (item.kind === 'decisive' || item.kind === 'need') fired = firstIn(texts, item.pay, chapter => chapter >= item.plantBy && chapter <= item.fireBy);
    else if (item.kind === 'question') fired = planted > 0 && planted <= item.plantBy ? firstIn(texts, item.pay, chapter => chapter >= spans[2].from) : 0;
    else if (item.kind === 'learn') {
      const early = firstIn(texts, item.plant, chapter => chapter < item.fireBy);
      fired = early ? 0 : firstIn(texts, item.plant, chapter => chapter === item.fireBy);
      return { ...item, planted: fired || early, fired, paySeen: early, near: fired ? '' : hint(texts, item.plant, item.fireBy, item.fireBy) };
    } else if (item.kind === 'clock') {
      const agreed = clockAgrees(texts[chapters - 1] || '', item.plant, item.pay);
      const near = agreed.ok ? '' : agreed.clash
        ? `Chapter ${chapters} says "${agreed.clash.slice(0, 160)}" against the clock's ${item.pay}.`
        : hint(texts, item.plant, chapters, chapters);
      return { ...item, planted: agreed.ok || agreed.clash ? chapters : 0, fired: agreed.ok ? chapters : 0, paySeen: 0, near };
    } else if (item.kind === 'waiting') {
      const words = contentWords(item.plant);
      const at = texts.findIndex((text, index) => index + 1 > item.plantBy && sentencesOf(text).some(sentence => shareCount(sentence, words) >= 2));
      const inLast = item.plantBy >= chapters && sentencesOf(texts[chapters - 1] || '').some(sentence => shareCount(sentence, words) >= 2);
      fired = at >= 0 ? at + 1 : inLast ? chapters : 0;
    } else if (item.kind === 'false') {
      const win = firstIn(texts, item.plant, chapter => chapter <= Math.min(item.plantBy, Math.max(1, chapters - 1)));
      const winAt = win ? locateSentence(texts[win - 1] || '', item.plant) : -1;
      const cost = win ? firstAfter(texts, item.pay, win, winAt) : 0;
      return { ...item, planted: win, fired: cost, paySeen: win ? 0 : paySeen, near: cost ? '' : hint(texts, win ? item.pay : item.plant, win || item.plantBy, chapters) };
    } else if (item.kind === 'irony') {
      const fact = firstIn(texts, item.plant, chapter => chapter <= item.plantBy);
      const factAt = fact ? locateSentence(texts[fact - 1] || '', item.plant) : -1;
      const belief = fact ? firstAfter(texts, item.pay, fact, factAt) : 0;
      const beliefAt = belief ? locateSentence(texts[belief - 1] || '', item.pay) : -1;
      const correction = belief && item.note
        ? (belief < chapters ? (locateSentence(texts[chapters - 1] || '', item.note) >= 0 ? chapters : 0) : firstAfter(texts, item.note, belief, beliefAt))
        : 0;
      const early = !correction && item.note ? firstIn(texts, item.note, chapter => chapter < chapters) : 0;
      const near = correction ? '' : early
        ? `Corrected in chapter ${early}; chapter ${chapters} does not carry that ending.`
        : hint(texts, item.note || item.pay, chapters, chapters);
      return { ...item, planted: fact, fired: correction, paySeen: belief, near };
    } else if (item.kind === 'plant') {
      const back = firstIn(texts, item.plant, chapter => chapter > planted && planted > 0);
      return { ...item, planted, fired: back, paySeen: 0, near: back ? '' : hint(texts, item.plant, planted + 1, chapters) };
    } else fired = firstIn(texts, item.pay, chapter => planted > 0 && (chapter > planted || (chapter === planted && !same)));
    if (item.kind === 'turn' || item.kind === 'want') return { ...item, planted: fired, fired, paySeen: 0, near: fired ? '' : hint(texts, item.plant, item.plantBy, item.fireBy) };
    const lookFor = planted ? item.pay : item.plant;
    const lookFrom = planted ? planted : 1;
    return { ...item, planted, fired, paySeen: planted ? 0 : paySeen, near: fired ? '' : hint(texts, lookFor, lookFrom, item.fireBy) };
  });
  const stakes = seen.filter(item => item.kind === 'stake' && item.act);
  for (const act of [2, 3] as const) {
    const stake = stakes.find(item => item.act === act);
    const earlier = stakes.find(item => item.act === (act - 1) as 1 | 2 | 3);
    if (!stake || !earlier) continue;
    const share = spans[act - 2].to >= spans[act - 1].from;
    if (!earlier.fired || (stake.fired && stake.fired < earlier.fired) || (stake.fired && stake.fired === earlier.fired && !share)) {
      stake.fired = 0;
      stake.near = !earlier.fired ? `Stake ${act} waits until stake ${act - 1} is met.` : `Stake ${act} is met before stake ${act - 1}.`;
    }
  }
  return seen;
}

/** The first chapter whose matching sentence comes after an earlier beat. */
function firstAfter(texts: string[], phrase: string, afterChapter: number, afterSentence: number): number {
  for (let chapter = afterChapter; chapter <= texts.length; chapter++) {
    const sentences = sentencesOf(texts[chapter - 1] || '');
    const start = chapter === afterChapter ? afterSentence + 1 : 0;
    if (sentences.slice(start).some(sentence => locateSentence(sentence, phrase) >= 0)) return chapter;
  }
  return 0;
}

const keyOf = (item: Held) => `${item.kind}\n${item.act || ''}\n${item.plant.toLowerCase()}\n${item.pay.toLowerCase()}\n${(item.note || '').toLowerCase()}`;

const namedKind = (kind: DebtKind) => kind !== 'clock' && kind !== 'plant' && kind !== 'waiting';

/** The first wording of a named debt. A later line with other words does not move what the page owes. */
function lockPhrases(named: Held[], previous: Held[]): Held[] {
  const prior = new Map<string, Held>();
  const priorGuns = previous.filter(item => item.kind === 'gun');
  for (const item of previous) if (namedKind(item.kind) && item.kind !== 'gun') prior.set(item.kind === 'turn' || item.kind === 'stake' ? `${item.kind}:${item.act}` : item.kind === 'learn' ? `learn:${item.fireBy}` : item.kind, item);
  let gun = 0;
  const seen = new Set<string>();
  return named.map(item => {
    if (!namedKind(item.kind)) return item;
    const slot = item.kind === 'gun' ? `gun:${gun++}` : item.kind === 'turn' || item.kind === 'stake' ? `${item.kind}:${item.act}` : item.kind === 'learn' ? `learn:${item.fireBy}` : item.kind;
    if (seen.has(slot)) return item;
    seen.add(slot);
    const old = item.kind === 'gun' ? priorGuns[gun - 1] : prior.get(slot);
    if (!old || keyOf(old) === keyOf(item)) return item;
    return { ...old, planted: 0, fired: 0, paySeen: 0, near: '' };
  });
}

/**
 * Obligations named in drama.md and plan.md, clocks in the envelope, plants
 * already set into chapters, and the latest reader waiting. One already on the
 * page stays if its line is deleted. One whose words were named stays those
 * words if the line is later rewritten.
 */
export function syncDrama(files: Record<string, string>, chapters: number, previous: Held[] = [], sources: DramaSources = {}): { held: Held[]; unread: string[] } {
  const fromDrama = readDrama(files['drama.md'] || '', chapters);
  const fromPlan = readDrama(files['plan.md'] || '', chapters);
  const named = lockPhrases([...fromDrama.held, ...fromPlan.held.filter(item => !fromDrama.held.some(have => keyOf(have) === keyOf(item)))], previous);
  const unread = [...fromDrama.unread, ...fromPlan.unread];
  const extras = [...clockLines(files['envelope.md'] || '', chapters), ...plantLines(sources.inserts, chapters), ...waitingLine(sources.waiting, chapters)];
  const kept = new Map([...named, ...extras].map(item => [keyOf(item), item]));
  for (const old of previous) {
    const seen = seeDrama([old], files, chapters)[0];
    if ((seen.planted || seen.fired) && !kept.has(keyOf(old))) kept.set(keyOf(old), { ...old, planted: 0, fired: 0, paySeen: 0 });
  }
  return { held: seeDrama([...kept.values()], files, chapters), unread };
}

const span = (from: number, to: number) => from === to ? `chapter ${from}` : `chapters ${from}–${to}`;

const NAMES: Record<DebtKind, string> = {
  gun: 'Gun', turn: 'Turn', stake: 'Stake', question: 'Question', decisive: 'Decisive act',
  false: 'False victory', irony: 'Irony', want: 'Want', need: 'Need', learn: 'First learning', clock: 'Clock', waiting: 'Reader waiting', plant: 'Plant',
};

export function obligationLine(item: Held): string {
  const name = `${NAMES[item.kind]}${item.act ? ` ${item.act}` : ''}`;
  const where = item.kind === 'turn' || item.kind === 'stake' || item.kind === 'want' ? span(item.plantBy, item.fireBy) : `by chapter ${item.fireBy}`;
  const aside = item.near ? ` ${item.near}` : '';
  if (item.fired) return `${name} held (met in chapter ${item.fired}): ${item.plant}`;
  if (item.kind === 'clock') return `Clock belongs to chapter ${item.fireBy}, and that chapter does not yet agree with it: ${item.plant}.${aside}`;
  if (item.kind === 'gun' && !item.planted && item.paySeen) return `Gun used in chapter ${item.paySeen} before it is set down (due by chapter ${item.plantBy}): ${item.plant}${aside}`;
  if (item.kind === 'learn' && item.paySeen) return `First learning already told in chapter ${item.paySeen}, before chapter ${item.fireBy}: ${item.plant}${aside}`;
  if (item.kind === 'irony' && item.near?.startsWith('Corrected')) return `Irony is not the ending. ${item.near}`;
  if (item.kind === 'irony' && item.planted && !item.fired) return `Irony shown in chapter ${item.planted}${item.paySeen ? `, believed in chapter ${item.paySeen},` : ''} and not yet corrected: ${item.plant}${aside}`;
  if (!item.planted && item.kind !== 'decisive' && item.kind !== 'need') return `${name} not on the page yet (${item.kind === 'turn' || item.kind === 'stake' ? `belongs in ${where}` : `set down by chapter ${item.plantBy}, used ${where}`}): ${item.plant}${item.pay !== item.plant ? ` → ${item.pay}` : ''}${aside}`;
  return `${name} set down${item.planted ? ` in chapter ${item.planted}` : ''} and not yet discharged (${where}): ${item.plant}${item.pay !== item.plant ? ` → ${item.pay}` : ''}${aside}`;
}

export function dramaticLedger(chapters: number, held: Held[], unread: string[]): string {
  const acts = actSpans(chapters).map(item => `act ${item.act} is ${span(item.from, item.to)}`).join('; ');
  const missing = missingShape(held, chapters);
  const open = held.filter(item => !item.fired);
  const clockWaiting = open.filter(item => item.kind === 'clock' && !item.near);
  const shown = open.filter(item => !(item.kind === 'clock' && !item.near));
  const lines = [`Acts, from the length of the book: ${acts}.`];
  if (missing.length) lines.push(`The shape is not named yet:\n${missing.map(item => `— ${item}`).join('\n')}`);
  lines.push(held.length ? `Obligations held: ${held.length - open.length} of ${held.length}.` : 'No obligation has been named.');
  if (shown.length) lines.push(shown.map(obligationLine).join('\n'));
  if (clockWaiting.length) lines.push(`The clock has ${clockWaiting.length} line${clockWaiting.length === 1 ? '' : 's'}. ${clockWaiting.length === 1 ? 'It is' : 'They are'} owed by chapter ${chapters} alone: an earlier chapter is not held for ${clockWaiting.length === 1 ? 'it' : 'them'}, and copying ${clockWaiting.length === 1 ? 'it' : 'them'} onto the page does not discharge ${clockWaiting.length === 1 ? 'it' : 'them'}.`);
  if (unread.length) lines.push(`Not counted, because the line is not an obligation: ${unread.slice(0, 4).map(line => `"${line.slice(0, 80)}"`).join('; ')}.`);
  return lines.join('\n');
}

/** What this chapter was supposed to settle and has not. A turn is named at the last chapter of its act. */
export function dueInChapter(held: Held[], chapter: number): string[] {
  return held.filter(item => !item.fired && (item.fireBy === chapter || (item.kind !== 'turn' && item.plantBy === chapter && !item.planted))).map(obligationLine);
}

/** Obligations named as lines, counted against chapter files. */
export function debtsFromLines(lines: string[], files: Record<string, string>, chapters: number): string[] {
  return openDebts(seeDrama(readDrama(lines.join('\n'), chapters).held, files, chapters));
}
export function openDebts(held: Held[]): string[] {
  return held.filter(item => !item.fired).map(obligationLine);
}
