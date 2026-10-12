import type { NovelLLM } from '../v2/llm';
import type { FinalReport, ProjectInput } from '../v2/types';
import type { DeskState } from './authorDesk';
import type { ProjectStore } from '../v2/store';

/**
 * The author writes the book once.
 *
 * This replaces the pipeline for new books. A pipeline had the model fill in a plan somebody
 * else had fixed, then inspected and repaired what it wrote; it took 300 calls and forty
 * minutes and the books were inventories. Given the premise, a desk and no procedure, the same
 * model wrote a story with a voice, the killing on the page and its guns hung in chapter one.
 * What it could not do was correct itself: with any tool to revise by, it went round in it
 * for more than half its calls, and every hole and duplicate in the text came from a revision.
 *
 * So nothing here is corrected. The clock and the plan are settled first. Each chapter is
 * written once and closed with its card and its facts. A reader reads after every chapter and
 * says what they are waiting for and what did not add up; both go forward, into the next
 * chapter's desk and into the report. Closed text and the clock are never reopened.
 * On the same premise: 18 calls and four minutes for eight chapters, against 95 and twenty
 * with revision, and the book no worse.
 */
export interface AuthorDraft {
  version: 1;
  input_key: string;
  /**
   * The author's own thinking, written before anything else and open beside it for the whole
   * book: the ending it writes toward, what is really going on, the voice. The two runs that
   * had one gave the liveliest prose of all; when the clock took its place the books went dry.
   */
  notebook?: string;
  clock: string;
  plan: string;
  /** The book's own title, given by the author with the plan. */
  title?: string;
  chapters: { text: string; card: string; facts: string; reader: string }[];
  /** Everything set up and not yet paid off, as the author last listed it. */
  threads?: string;
  /** The author's desk, when the book is written by the author working as it sees fit. */
  desk?: DeskState;
  /** What the last reader said they are waiting for; given to the next chapter. */
  waiting: string;
  /** What readers said did not add up, chapter by chapter; carried forward and reported. */
  noticed: string[];
  completed: boolean;
}

const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
const paragraphs = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
export const authorKey = (input: ProjectInput): string => JSON.stringify([input.premise, input.chapter_count, input.target_total_words, input.genre, input.author_requirements]);
export const comesOut = (clock: string): string => clock.split('\n').find(line => /^\W*HOW IT COMES OUT:/i.test(line))?.trim() || '';

const rule = (part: string) => /^[-=*_~\s]{3,}$/.test(part);
/**
 * A chapter is prose. Code takes off what is not: the "Chapter One" heading the page already
 * carries, a rule left at the end before the card, and a paragraph that appears twice.
 * A rule at the end used to be read as a chapter that stops mid-sentence: in the first book
 * written through the app, six good chapters were refused for it and written again.
 */
export function cleanChapter(text: string): string {
  const seen = new Set<string>();
  const parts = paragraphs(text).filter(part => { if (part.length < 80) return true; if (seen.has(part)) return false; seen.add(part); return true; });
  // "END OF CHAPTER TWO", and after the last chapter the title of the book again: a model's flourish, not the chapter.
  const end = parts.findIndex((part, at) => at >= parts.length - 4 && /^[*_#\s]*(END OF (THE )?(CHAPTER|BOOK|NOVEL)\b[^\n]*|THE END)[*_\s.]*$/i.test(part));
  if (end > 0) parts.length = end;
  // A pointer to the author's own desk — "[Record: see keeper entry for chapter 1.]" — is a note to itself, not a line of the book.
  const aside = (part: string) => /^[*_\s]*\[[^\]\n]{0,160}\b(record|keeper|dossier|notebook|plan\.md|facts)\b[^\]\n]{0,160}\][*_\s.]*$/i.test(part);
  while (parts.length && (rule(parts.at(-1)!) || aside(parts.at(-1)!))) parts.pop();
  while (parts.length && (rule(parts[0]) || /^#{1,3}\s*\**\s*chapter\b[^\n]*$/i.test(parts[0]))) parts.shift();
  return parts.join('\n\n');
}

/** The author's answer for a chapter: the prose, then its card, then its facts. */
export function readChapter(answer: string): { text: string; card: string; facts: string; threads: string } {
  const [body, rest] = answer.split(/\n\s*={3,}\s*CARD\s*\n/i);
  const [card, after] = (rest || '').split(/\n\s*={3,}\s*FACTS\s*\n/i);
  const [facts, threads] = (after || '').split(/\n\s*={3,}\s*THREADS\s*\n/i);
  return { text: cleanChapter(body || ''), card: (card || '').trim(), facts: (facts || '').trim(), threads: (threads || '').trim() };
}

const sentences = (text: string) => text.replace(/^#+[^\n]*\n/gm, '').split(/(?<=[.!?…"”])\s+/).map(part => part.trim()).filter(part => part.split(/\s+/).length > 3);

/**
 * Turns of phrase the book has already used three times or more, counted by code. Shown the
 * whole chapter before it, a model took it for a pattern: "looked at the middle distance and
 * said nothing" eight times in one book, "a sky deciding whether to rain" four. A refrain used
 * twice is a motif; the author is told which ones have stopped being that.
 */
export function wornPhrases(texts: string[], limit = 14): string[] {
  const seen = new Map<string, number>();
  // A phrase lives inside one sentence: windows are not taken across a full stop.
  for (const sentence of texts.flatMap(text => text.split(/[.!?…\n]+/))) {
    const tokens = sentence.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean);
    for (let at = 0; at + 5 <= tokens.length; at++) { const gram = tokens.slice(at, at + 5).join(' '); seen.set(gram, (seen.get(gram) || 0) + 1); }
  }
  const worn = [...seen].filter(([, times]) => times >= 3).sort((a, b) => b[1] - a[1]);
  const next = new Map<string, string[]>();
  for (const [gram] of worn) { const head = gram.split(' ').slice(0, 4).join(' '); next.set(head, [...(next.get(head) || []), gram]); }
  const used = new Set<string>(), kept: [string, number][] = [];
  // Five-word windows that overlap are one phrase: each is grown to its full length and counted once.
  for (const [gram, times] of worn) {
    if (used.has(gram)) continue;
    const phrase = gram.split(' '); used.add(gram);
    for (let grown = 0; grown < 8; grown++) {
      const follow = (next.get(phrase.slice(-4).join(' ')) || []).find(other => !used.has(other));
      if (!follow) break;
      used.add(follow); phrase.push(follow.split(' ').at(-1)!);
    }
    if (new Set(phrase).size < 3) continue;
    kept.push([phrase.join(' '), times]);
    if (kept.length >= limit) break;
  }
  return kept.map(([gram, times]) => `"${gram}" (${times} times)`);
}

export function chapterFault(answer: string, words: number): string {
  const { text, card, facts } = readChapter(answer);
  const last = (paragraphs(text).at(-1) || '').replace(/[*_~\s]+$/, '');
  return count(text) < words * 0.5 ? `The chapter is ${count(text)} words; it should be about ${words}.`
    : !/[.!?…"”’')\]—–-]$/.test(last) ? 'The chapter stops in the middle of a sentence.'
    : count(card) < 25 ? 'The card after the line === CARD is missing or too short.'
    : facts.split('\n').filter(line => line.trim()).length < 4 ? 'The facts after the line === FACTS are missing: at least four lines.' : '';
}

export function clockFault(clock: string, chapters: number): string {
  const limit = Math.max(1, chapters - 3);
  const shown = Number(comesOut(clock).match(/chapter\s+(\d+)/i)?.[1] || 0);
  return count(clock) > 850 ? `It is ${count(clock)} words; at most 700. Facts only.`
    : !shown ? 'The line beginning HOW IT COMES OUT: with "chapter N" is missing.'
    : shown > limit ? `HOW IT COMES OUT says chapter ${shown}; the reader must first see it no later than chapter ${limit}.` : '';
}

const authorVoice = (input: ProjectInput, words: number): string => `You are the author of a ${input.genre || 'novel'} that is meant to sell: a book a stranger opens in a shop and cannot put back. It is your book. Nobody corrects it, and neither do you: each thing you write is written once and stands. So decide before you write, and write what you decided.

THE PREMISE YOU WERE GIVEN:
${input.premise}
${input.author_requirements && input.author_requirements !== '(none)' ? `\nWHAT THE PUBLISHER PUT ON THE FORM:\n${input.author_requirements}\nAudience, tone, the ending and how intimate scenes are written are binding. Voice and tense are a suggestion: tell this story in the voice it is best told in, and say which in your notebook.\n` : ''}
THE BOOK: the whole story, complete, in ${input.chapter_count} chapters of about ${words} words each. It begins, turns, gets worse and ends inside these chapters.`;

/** What the author has in front of it when it writes chapter n. */
export function deskFor(draft: AuthorDraft, n: number): string {
  const closed = draft.chapters.slice(0, n - 1);
  const before = closed.at(-1);
  // The chapter before is given by its last page, not whole. Given whole it was copied:
  // three chapters running opened in the same room with the same sentence and closed on the
  // same exchange in the same kitchen. What is needed of it is where it left off.
  const tail = before ? before.text.split(/\s+/).slice(-Math.min(900, Math.floor(count(before.text) * 0.5))).join(' ') : '';
  // The first page of the book is its voice. Every later chapter is written with it in sight.
  const voice = closed.length > 1 ? closed[0].text.split(/\s+/).slice(0, 280).join(' ') : '';
  const shapes = closed.map((chapter, at) => { const all = sentences(chapter.text); return `Chapter ${at + 1} opened: "${(all[0] || '').slice(0, 170)}" — and closed: "${(all.at(-1) || '').slice(0, 170)}"`; });
  const worn = wornPhrases(closed.map(chapter => chapter.text));
  return (draft.notebook ? `YOUR NOTEBOOK — your own thinking about this book. It is why the book is what it is; write from it:\n${draft.notebook}\n\n` : '') + `YOUR CLOCK (settled):\n${draft.clock}\n\nYOUR PLAN:\n${draft.plan}`
    + (voice ? `\n\nTHE FIRST PAGE OF THE BOOK. This is its voice; every chapter is told in it:\n${voice}…` : '')
    + (closed.length ? `\n\nTHE DOSSIER — what the closed chapters have committed the book to. This is now true; agree with it exactly:\n${closed.map((chapter, at) => `From chapter ${at + 1}:\n${chapter.facts}`).join('\n')}` : '')
    + (closed.length ? `\n\nTHE CHAPTERS SO FAR, BY YOUR CARDS:\n${closed.map((chapter, at) => `Chapter ${at + 1}: ${chapter.card}`).join('\n\n')}` : '')
    + (draft.threads ? `\n\nSET UP AND NOT YET PAID OFF, as you last listed it. Each of these is a promise to the reader:\n${draft.threads}` : '')
    + (tail ? `\n\nWHERE THE CHAPTER BEFORE THIS ONE LEFT OFF (its last pages):\n…${tail}` : '')
    + (shapes.length ? `\n\nHOW THE CHAPTERS SO FAR OPENED AND CLOSED. This chapter is not built like any of them: it opens somewhere else, at another hour, on another kind of sentence, moves in a different order, and ends on a different kind of beat:\n${shapes.join('\n')}` : '')
    + (worn.length ? `\n\nTURNS OF PHRASE THIS BOOK HAS ALREADY WORN OUT, counted by code. Do not use any of them, or anything close to them, again:\n${worn.join('; ')}` : '')
    + (draft.waiting ? `\n\nA READER WHO HAS READ THIS FAR SAYS WHAT THEY ARE WAITING FOR. Give it, delay it or turn it on its head; do not ignore it, and do not simply do what they expect:\n${draft.waiting}` : '')
    + (draft.noticed.length ? `\n\nTHINGS READERS NOTICED THAT DID NOT ADD UP. The closed chapters cannot be changed. Do not explain these away in the text; make sure nothing from here on makes them worse, and where a later line can quietly make a thing consistent, let it:\n${draft.noticed.slice(-6).join('\n')}` : '');
}

/** The reader's answer, split into what goes forward. */
export function readReader(said: string, n: number): { waiting: string; noticed: string } {
  const waiting = (said.split(/SLIPPED:/i)[0] || '').replace(/WAITING FOR:/i, '').trim();
  const gap = (said.split(/DOES NOT ADD UP:/i)[1] || '').trim();
  return { waiting, noticed: gap.length > 12 && !/^\W*nothing\b/i.test(gap) ? `After chapter ${n}: ${gap.replace(/\s+/g, ' ').slice(0, 500)}` : '' };
}

export interface AuthorStore { saveAuthor(draft: AuthorDraft): void; loadAuthor(): AuthorDraft | null }

/**
 * Write the book, or go on with it where it stopped. Every step is saved before the next is
 * asked for, so a book stopped at any point resumes with the chapter it was on.
 */
export async function writeBookOnce(input: ProjectInput, store: ProjectStore & AuthorStore, llm: NovelLLM,
  progress: (stage: string, chapter?: number) => void = () => {}): Promise<void> {
  const chapters = input.chapter_count, words = Math.max(300, Math.round(input.target_total_words / chapters));
  const system = authorVoice(input, words);
  let draft: AuthorDraft = store.loadAuthor() || { version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false };
  const save = () => store.saveAuthor(draft);

  // Asked again, whole, with exactly what is missing; three times at most, then it stands as written.
  const settled = async (stage: string, label: string, prompt: string, maxTokens: number, fault: (text: string) => string): Promise<string> => {
    let refusal = '', text = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      text = (await llm(prompt + (refusal ? `\n\nYOUR LAST ANSWER WAS NOT USABLE: ${refusal}\nWrite it again, whole, with that put right.` : ''), system, { stage, route: 'validator', temperature: 0.8, maxTokens })).trim();
      refusal = text ? fault(text) : 'It was empty.';
      if (!refusal) return text;
      store.log('author', `${label}: not usable (${refusal}); asked again.`);
    }
    store.log('author', `${label}: kept as written after three tries (${refusal}).`);
    return text;
  };

  if (!draft.notebook && !draft.clock) {
    progress('design');
    draft.notebook = await settled('author-notebook', 'The notebook', `Before anything else, your notebook. This is where you think, for yourself alone, and you will have it open beside you for the whole book. Write it as a writer's notes, not as a form to fill in. Decide in it:
- The book in one line, the way you would say it to a friend.
- The ending you are writing toward, and what makes it cost something.
- What is really going on, in order: the truth the reader will only have whole at the end. Not what the premise says — what is under it. If the premise can be turned once more, turn it.
- What each of the people wants, what each is hiding, and what each would never do.
- The voice. Who tells this, in what person and tense, how they sound, what they notice and what they will not say. Then three sentences of the book in that voice.
- What the first chapter has to do to a stranger who opens it in a shop.
- What has to be put down early, in passing, and where it will be paid off.
About 800 to 1,500 words. Return only the notebook.`, 4500, text => count(text) > 2400 ? `It is ${count(text)} words; at most 1,500.` : count(text) < 250 ? 'It is too short to work from: at least 800 words of real decisions.' : '');
    save(); store.log('author', `The notebook is written: ${count(draft.notebook)} words.`);
  }
  if (!draft.clock) {
    progress('design');
    draft.clock = await settled('author-clock', 'The clock', `${draft.notebook ? `YOUR NOTEBOOK:\n${draft.notebook}\n\n` : ''}Now the clock of this story, as your notebook has it: facts by the day and hour, and no reasons. At most 700 words.
- The year the story is set in. Everything people carry and use belongs to that year.
- Who does the worst thing in this story, with whose hands, where, on what date and at what hour.
- Where every other person is at that hour, and who could swear to it.
- The dates the book turns on, as a calendar: day of the week and date for each, from the first scene to the last. Count the weeks; they have to add up.
- Every object the plot depends on: what it is, whose it is, where it is at the start and where it ends. If there are two alike, say which is which and how anyone could tell.
- One line beginning WHY SHE CANNOT SIMPLY SAY SO: — whoever the protagonist is. If the protagonist has an alibi, or a record, or a witness that would clear them, say exactly why using it costs more than keeping silent, or why it does not clear them. A trap that one true sentence to the police would open is not a trap.
- One line beginning HOW IT COMES OUT: naming the one thing the truth finally comes out by — an object, a record, a person who saw — and the chapter in which the reader first sees it, written as "chapter N", with N no later than ${Math.max(1, chapters - 3)}. An ending that rests on something the reader was never shown is a cheat.
Every time, place and name in it must agree with every other. Return only the clock.`, 2600, text => clockFault(text, chapters));
    save(); store.log('author', `The clock is settled: ${count(draft.clock)} words. ${comesOut(draft.clock).slice(0, 300)}`);
  }
  if (!draft.plan) {
    progress('design');
    draft.plan = await settled('author-plan', 'The plan', `${draft.notebook ? `YOUR NOTEBOOK:\n${draft.notebook}\n\n` : ''}YOUR CLOCK (settled; it does not change):\n${draft.clock}\n\nNow the plan of the book, for your own use while writing. Its first line is TITLE: and the title of the book, a title a publisher would print, not a description. Then ${chapters} chapters. Begin the entry of each chapter with the days and dates it covers, taken from the calendar in your clock, so that no chapter can drift off it. Then, in three or four lines: what happens, where, and between whom; what the reader comes to know or fear; the turn it ends on; and anything it must set down in passing that a later chapter will need — including the thing the truth comes out by, in the chapter your clock names. The worst thing happens on the page or the protagonist walks in on it. The last decisive act is the protagonist's, in person, at a cost. At most 900 words. Return only the plan.`, 3200,
      text => count(text) > 1100 ? `It is ${count(text)} words; at most 900.` : '');
    const named = draft.plan.match(/^\W*TITLE:\s*(.+)$/im)?.[1].replace(/[*_"“”]+/g, '').trim();
    if (named && named.length <= 90) draft.title = named;
    save(); store.log('author', `The plan is written: ${count(draft.plan)} words.${draft.title ? ` The book is called "${draft.title}".` : ''}`);
  }

  for (let n = draft.chapters.length + 1; n <= chapters; n++) {
    progress('chapter', n);
    const answer = await settled('author-chapter', `Chapter ${n}`, `${deskFor(draft, n)}\n\nNow write chapter ${n} of ${chapters}, once and whole, about ${words} words. Every day, date and hour in it is taken from your clock and your plan, and agrees with the dossier. Do not head it with its chapter number; a title of its own on the first line is welcome. ${n === chapters ? 'This is the last chapter: its last page is the end of the book. Everything on your list of what is set up and not yet paid off is paid off here, on the page, or is something you mean the reader to be left with. Nothing is simply dropped.' : ''}
Then, after the chapter, a line containing only === CARD, and its card for your own later use, five to eight lines: what happened, what the reader now knows and fears, what was set up and not yet paid off.
Then a line containing only === FACTS, and the facts this chapter has committed the book to, one per line: every day, date and hour; how each person is named and titled; who has which object and where it is at the end; what each person now knows; and anything about anyone's week that this chapter changed (an appointment moved, a habit ended).
Then a line containing only === THREADS, and the whole list, as it now stands, of everything set up and not yet paid off: carry over what is still open from the list on your desk, leave out what this chapter paid off, add what it opened. One per line, each with how you mean to pay it off and roughly where.`,
      Math.max(7000, Math.ceil(words * 3.4)), text => chapterFault(text, words));
    const chapter = readChapter(answer);
    draft.chapters.push({ text: chapter.text, card: chapter.card, facts: chapter.facts, reader: '' });
    if (chapter.threads) draft.threads = chapter.threads;
    save();
    store.saveManuscript(n, chapter.text);
    store.log('author', `Chapter ${n} is written and closed: ${count(chapter.text)} words.`);
    store.checkpoint(`author-chapter-${n}`);

    // A reader, who sees only the text. What they say goes forward; nothing is sent back.
    try {
      const book = draft.chapters.map(item => item.text).join('\n\n');
      const said = (await llm(`${book}\n\n---\nThat is ${n === chapters ? 'a whole short novel' : `the first ${n} chapter${n > 1 ? 's' : ''} of a novel`} you picked up in a shop. You know nothing else about it. Answer as a reader, not as an editor, in under 200 words, in exactly three parts:
WAITING FOR: ${n === chapters ? 'whether the ending gave you what the book had made you wait for, and what it left you with' : 'what you are now waiting to find out, and what you expect will happen next'}.
SLIPPED: the exact place in the LAST chapter where your attention slipped, if it did, or the word nowhere.
DOES NOT ADD UP: anything in the last chapter that contradicts what came before — a date or hour, a place, who has which object, who knew what, who could have done it — or the word nothing.`,
        'You are an ordinary reader. You are not a writer and you give no advice on craft.', { stage: 'author-reader', route: 'validator', temperature: 0.7, maxTokens: 900 })).trim();
      const forward = readReader(said, n);
      draft.chapters[n - 1].reader = said; draft.waiting = forward.waiting;
      if (forward.noticed) draft.noticed.push(forward.noticed);
      save(); store.log('author', `A reader after chapter ${n}: ${said.replace(/\s+/g, ' ').slice(0, 500)}`);
    } catch (error) {
      // The book does not wait for its reader: the next chapter is written without that note.
      store.log('author', `No reader after chapter ${n} (${error instanceof Error ? error.message.slice(0, 160) : error}); the book goes on.`);
    }
  }

  draft.completed = true; save();
  const total = draft.chapters.reduce((sum, chapter) => sum + count(chapter.text), 0);
  const last = draft.chapters.at(-1)?.reader || '';
  const report: FinalReport = {
    coverage: { material_examined: `${chapters} chapters, ${total} words, each read once by a reader who saw only the text.`, limitations: ['Nothing was corrected: what readers noticed is listed here as they said it.'] },
    findings: draft.noticed.map(item => ({ category: 'continuity', severity: 'minor', description: item, evidence_refs: [], reader_impact: 'A reader noticed it.', certainty: 'reported by one reader' })),
    central_resolution: { supported: true, evidence_refs: [], comment: (last.split(/SLIPPED:/i)[0] || '').replace(/WAITING FOR:/i, '').trim().slice(0, 600) || 'The last chapter was not read.' },
    unresolved_major_promises: [], need_more_evidence: [],
    summary: `The book is written: ${chapters} chapters, ${total} words. Readers noticed something that did not add up after ${draft.noticed.length} of ${chapters} chapters; nothing was rewritten.`,
    status: draft.noticed.length ? 'COMPLETE_WITH_WARNINGS' : 'COMPLETE',
  } as FinalReport;
  store.saveReport(report);
}
