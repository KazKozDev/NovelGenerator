import type { NovelLLM } from '../v2/llm';
import type { FinalReport, ProjectInput } from '../v2/types';
import type { ProjectStore } from '../v2/store';
import { authorKey, cleanChapter, wornPhrases, type AuthorDraft } from './author';

/**
 * The author at its desk, working as it sees fit.
 *
 * This is the first form the author had, and the one that gave the best prose: a desk of
 * files it owns, a few tools, the premise and a budget of calls — and no procedure. It
 * decided for itself to think in its notebook first, to ask a character what she would do
 * before writing her, to hand a chapter to a reader, to go back and set something up in a
 * chapter it had already written. Later versions took those decisions away one by one, to
 * stop it going round in circles, and the books went dry with them.
 *
 * Nothing here tells it what to do next. Its will is free; what is chosen is what it finds in
 * its hands. Every tool is made so that the easy use of it is the good one:
 * - a chapter is changed by writing it again, or at one place the author names: a thing set in after a line (plant),
 *   or other words put where words stand now (change). The place is named by quoting it, and code finds it: every
 *   such tool searches first. Words that stand in one place are acted on there; words that stand in several places, or
 *   nowhere, change nothing, and the author is shown every place, or the lines nearest to what it quoted. The old tool
 *   for patching guessed at the place, and every seam, lost line and doubled paragraph came from that. The same search
 *   is a tool of its own (find), for looking without touching, and looking costs nothing: one author wrote a chapter
 *   out four times to change a line it could not see had already changed.
 * - a reader who has read a chapter has read it: asked again about the same text, the same
 *   answer comes back at no cost. A second reader for a rewritten chapter is dearer than the
 *   first, a third dearer still. It went round a chapter sixty times when readers were cheap.
 * - writing a chapter brings back what code can count: the turns of phrase the book has worn
 *   out, and the days and hours this chapter names beside those the earlier ones named, and
 *   the ages and spans of time it names beside theirs.
 * - there is someone to ask what the book already says, so that a fact is looked up, not guessed.
 * - among its files is an envelope: the scene the reader is not shown until the end, written as a scene. Nothing is
 *   done with it — no seal, no list, nobody set to read it: with those the author followed a procedure and stopped
 *   asking. The file alone is kept because of what the books say without it. Reader after reader of a finished book
 *   says the same thing: "I still don't know what happened in that room", and the author then writes its last chapter
 *   again and again, longer each time, to find out. When the file was there, every author wrote the scene first, and
 *   their endings were built from things their first chapters had set down.
 * - a reader is another model than the author when one is set: the same head does not see what it wrote past.
 * - nothing is closed to it. It may go back to any chapter, write it again, set a thing into it. Doors were tried —
 *   chapters that "went to the typesetter", one rewrite and no more, a book declared finished — and each one stopped a
 *   loop by stopping the author: one found the single real hole in its book, was refused three ways and was ended.
 *   What it gets instead is a mirror. When it comes round to the same chapter a third time, or asks the keeper what it
 *   has asked before, it is told so, in its own steps: which ones brought it here, how the chapter changed each time,
 *   how many calls are left. What it does then is its own decision.
 * - once, as the last chapter is about to be written, a reader of the book so far says what they are holding — what
 *   was promised and not given yet. One book raised the question of who knew the day of five deaths and never
 *   came back to it; another forged the heroine's own will and then forgot the threat.
 * Nothing here tells it what to do next. What is kept from the later versions is only what
 * informs it: an answer from a reader or a character stays on the desk until it is no longer
 * about the text as it stands, and says so when it is not; the journal of its own steps is
 * there to read; and it is told plainly how much budget is left.
 */
export interface DeskState {
  files: Record<string, string>;
  /** What readers and characters answered: who, at which step, about which chapter. */
  answers: { who: string; step: number; about: string; text: string; stale?: boolean; /** What the author asked, in its own words. */ asked?: string }[];
  /** What was set into a written chapter with plant, and where. Kept for the screen; nothing reads it back. */
  inserts?: { step: number; file: string; kind: 'plant' | 'unfold' | 'change'; at: string; text: string }[];
  /** How many answers that only looked with find have been given free. */
  free_looks?: number;
  /** How many answers running have only looked. */
  look_streak?: number;
  /** What each look last showed, so that a look taken again can say what has changed since, or that nothing has. */
  looks?: Record<string, { steps: number[]; count: number; sight: string }>;
  /** Whether the author has been told, on saying done, what the book left hanging. */
  told_promises?: boolean;
  /** How many times the author has been shown each round it was going: it is shown again only when the round has grown. */
  shown_rounds?: Record<string, number>;
  /** How many readers each chapter has had: the next one costs more. */
  readings?: Record<string, number>;
  journal: string[];
  step: number;
  budget: number;
  spent: number;
  finished: boolean;
}

export const chapterFile = (n: number): string => `chapter-${n}.md`;
const NOTES = ['notebook.md', 'dossier.md', 'plan.md', 'envelope.md'];
const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
const field = (text: string, name: string) => text.match(new RegExp(`^\\**${name}\\**\\s*:\\**\\s*(.*)$`, 'mi'))?.[1].trim() || '';

/** One answer from the author: a thought, one tool, and what the tool is given. */
export function readStep(answer: string): { thought: string; tool: string; file: string; name: string; content: string } {
  const split = answer.search(/\n-{3,}[ \t]*(\n|$)/);
  const head = split >= 0 ? answer.slice(0, split) : answer;
  const content = split >= 0 ? answer.slice(split).replace(/^\n-{3,}[ \t]*\n?/, '') : '';
  return { thought: field(head, 'THOUGHT'), tool: field(head, 'TOOL').toLowerCase().replace(/[^a-z_]/g, ''),
    file: field(head, 'FILE').replace(/[`"'*]/g, '').trim(), name: field(head, 'NAME').replace(/[*]/g, '').trim(), content };
}

/**
 * An answer may hold several steps one after another: the author often sets up its notes
 * and writes a chapter in one go. Each is a step of its own. Read as one, the first tool got
 * everything after it as its content — a dossier holding the plan, the notebook and a chapter —
 * and the author then found its other files empty and could not tell why.
 */
export function readSteps(answer: string): ReturnType<typeof readStep>[] {
  const starts = [...answer.matchAll(/^\**(?:THOUGHT|TOOL)\**\s*:/gm)].map(match => match.index!);
  // A step begins at THOUGHT, or at TOOL when no THOUGHT of its own came just before it.
  const begins = starts.filter((at, index) => index === 0 || /^\**THOUGHT/m.test(answer.slice(at, at + 12)) || !/^\**THOUGHT/m.test(answer.slice(starts[index - 1], starts[index - 1] + 12)));
  if (begins.length < 2) return [readStep(answer)];
  return begins.map((at, index) => readStep(answer.slice(at, begins[index + 1] ?? answer.length).trim())).filter(step => step.tool);
}

const voice = (input: ProjectInput, words: number, files: string[]): string => `You are the author of a ${input.genre || 'novel'} that is meant to sell: a book a stranger opens in a shop and cannot put back. It is your book. Nobody will tell you how to work, and nobody will check your work or correct it: what is on your desk when your budget runs out is what gets printed.

THE PREMISE YOU WERE GIVEN:
${input.premise}
${input.author_requirements && input.author_requirements !== '(none)' ? `\nWHAT THE PUBLISHER PUT ON THE FORM:\n${input.author_requirements}\nAudience, tone, the ending and how intimate scenes are written are binding. Voice and tense are a suggestion: tell this story in the voice it is best told in.\n` : ''}
YOUR JOB: the whole story, complete, in ${input.chapter_count} chapters, in the files ${chapterFile(1)} to ${chapterFile(input.chapter_count)}. The publisher has a book of roughly ${input.target_total_words} words in mind; a chapter is as long as it needs to be, and none is ever padded or cut to a size. It begins, turns, gets worse and ends inside these chapters: the last page of the last chapter is the end of the book. Every chapter is yours for as long as you have calls: you may go back to any of them. Write the book in English.

YOUR DESK (files you own and may rewrite at any time): notebook.md for your thinking and decisions, with the title of the book on a line beginning TITLE:; dossier.md for people, facts, dates and where things are; plan.md for the story in whatever form helps you; envelope.md for the scene the reader is not shown until the end — what was really done, by whose hands, with which things, through which door, at what hour — written as a scene, moment by moment, not as notes, and yours to write again like any other file; and one file per chapter. Your files: ${files.join(', ')}.

YOUR TOOLS. An answer is one step, or several steps one after another, each in exactly this form:

THOUGHT: one or two sentences on what you are doing and why
TOOL: write | append | plant | change | find | ask_character | ask_keeper | ask_reader | done
FILE: the file (for write, append, plant, change, ask_reader; for find and change it may be left out, and the whole book is searched)
NAME: the character (for ask_character)
---
the content

- write replaces the whole file with the content. append adds the content to its end. A chapter is revised by writing it again, whole.
- change: puts other words where words stand now, at one place. The content is the words as they stand, quoted exactly — a phrase is enough when it stands in one place only — then a line containing only ===, then what should stand there instead (nothing, to take them out). For a line or a short passage; what a chapter does is changed by writing it again.
- find: shows every place in the book where a word or phrase stands, with the chapter and the whole sentence. The content is the word or phrase; with no content it shows what stands in the book more than once, word for word. Code looks, not a reader: it is exact, it changes nothing, and an answer that only looks costs no call (the first two in a row).
- plant and change look for the place before they touch it. If the words you quoted stand in more than one place, or nowhere, nothing is changed: you are shown every place they stand, numbered, or the lines nearest to them, and can quote the one you mean or name it by its number.
- plant: sets one thing into a chapter already written, for another chapter to pay off: a thing on a table, a line someone says. The content is the paragraph the new text goes after, quoted from its first few words, then a line containing only ===, then the new text, at most 120 words.
- ask_character: another mind answers as that person, alone, knowing only what you tell it. The content is what that person knows and wants, and the question you put to them. For when you need someone to act from inside rather than for your convenience. It may be the one whose work in this story is to doubt it: a detective told how the thing was done will say what does not hold.
- ask_keeper: someone who has the whole book in front of them answers a question of fact from what is on the page, with the line it stands in: where a thing is, what day it was, who knew what and since when. The content is the question.
- ask_reader: a stranger reads the book from its first page to the end of the chapter in FILE, knowing nothing else, and tells you what they are waiting for, where their attention slipped and what did not add up. The content is anything you want to ask them, or empty.
- done: you are finished. No content.


Every answer costs one call from your budget, however many steps it holds; an answer that only looks with find costs none, twice running; a third such answer in a row costs a call. Asking a character or the keeper costs one more. The first reader of a chapter costs one more; a second reader of the same chapter, after you have rewritten it, costs three, and a third five, because fresh readers are scarce. A reader asked about text they have already read simply tells you again what they said, at no cost. When you ask someone, that is the last step of the answer: you will have their reply before your next one. When you write a chapter, that too is the last step of the answer: one chapter to an answer, and you will see what came back with it before you write the next. Notes — the notebook, the plan, the dossier — may share an answer with each other and come before a chapter. Keep an answer to what fits in about three thousand words. When the budget reaches zero you are stopped where you are, so leave yourself the calls to finish. How you spend it is your decision.`;

const NUMBER = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?';
const AGE = '(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:-(?:one|two|three|four|five|six|seven|eight|nine))?|[1-9]\\d)';
/**
 * The ages and spans of time a text names: "at sixteen", "was nineteen", "twenty-two years", "a year",
 * "eleven days". One book took its heroine in at sixteen in three chapters and at nineteen in a fourth,
 * and called three months "a year" twice; these are what a book most often gets wrong against itself.
 */
export function spansOf(text: string): string[] {
  const spans = text.match(new RegExp(`\\b${NUMBER} (?:years?|months?|weeks?|days?|decades?|winters?|summers?)(?: old| ago| later| before| earlier)?\\b`, 'gi')) || [];
  const ages = text.match(new RegExp(`\\b(?:at|was|were|is|am|turned|aged) ${AGE}\\b(?!-\\w|:\\d|[- ](?:years?|months?|weeks?|days?|hours?|minutes?|percent|o'clock|dollars?|thousand|hundred|miles?|feet|people|men|women|of|times|past|to|in the|at night|in the morning|a\\.m|p\\.m)\\b)`, 'gi')) || [];
  return [...new Set([...ages, ...spans].map(found => found.toLowerCase().replace(/\s+/g, ' ')))].filter(found => !/^(a|an|one) days?$/.test(found)).slice(0, 18);
}

/**
 * Having written a file, a model sometimes goes on and writes the desk it expects to see
 * next — "===== chapter-3.md (0 words) =====", "BUDGET LEFT: 19 of 24 calls" — and that went
 * into the chapter. Anything from the first line of the desk's own furniture on is not the file.
 */
export function ownWords(content: string): string {
  const echo = content.search(/^(={3,}\s*[\w.-]+\.md\s*\(\d+ words|RESULT OF YOUR LAST TOOL|YOUR DESK NOW|WHAT READERS AND CHARACTERS HAVE TOLD YOU|YOUR STEPS SO FAR|BUDGET LEFT:)/m);
  return (echo >= 0 ? content.slice(0, echo) : content).replace(/(\n[ \t]*[-=*_~]{3,}[ \t]*)+\s*$/, '').trim();
}

/**
 * Where the author is, said with its budget: what is done, what is not, and about how many calls what is left has
 * taken other authors at this desk. Code counts it from the journal; the figures are from forty-four books written
 * here (six chapters, twenty-four calls): to the last chapter, a chapter and what went round it — a question, a thing
 * set in — took about two calls; after the last chapter authors spent about six more, on one reader of the whole book
 * (two calls), a chapter or two written again and a few lines. A guide, never a rule: nothing is held back for it.
 */
export function whereYouAre(state: DeskState, chapters: number): string {
  const names = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1));
  const done = names.filter(name => state.files[name]?.trim()), todo = names.filter(name => !state.files[name]?.trim()), left = state.budget - state.spent;
  const lines = (pattern: RegExp) => state.journal.filter(line => pattern.test(line)).length;
  const again = names.map(name => ({ name, times: lines(new RegExp(`^\\d+\\. wrote ${name.replace('.', '\\.')} `)) })).filter(item => item.times > 1);
  const asked = [[lines(/^\d+\. a reader read through/), 'a reader'], [lines(/^\d+\. asked the keeper/), 'the keeper'], [lines(/^\d+\. asked (?!the keeper)/), 'your people']].filter(([times]) => times).map(([times, who]) => `${who} ${times === 1 ? 'once' : `${times} times`}`);
  const set = [[lines(/^\d+\. planted in/), 'set in'], [lines(/^\d+\. changed in/), 'changed'], [lines(/^\d+\. looked for/), 'looked for']].filter(([times]) => times).map(([times, what]) => `${times} ${what}`);
  const notes = NOTES.filter(name => !state.files[name]?.trim());
  const where = `WHERE YOU ARE: ${done.length} of ${chapters} chapters written${todo.length ? ` (${todo.join(', ')} to go)` : ''}${notes.length === NOTES.length ? '; your notes are empty' : ''}.`
    + (state.step ? ` So far: ${state.step} answer${state.step === 1 ? '' : 's'}${asked.length ? `; asked ${asked.join(', ')}` : '; nobody asked yet'}${set.length ? `; ${set.join(', ')}` : ''}${again.length ? `; written more than once: ${again.map(item => `${item.name} (${item.times})`).join(', ')}` : ''}.` : '');
  const need = todo.length * 2, after = Math.round(state.budget / 4);
  const ahead = todo.length
    ? `the ${todo.length} chapter${todo.length > 1 ? 's' : ''} still to write took other authors about ${need} call${need > 1 ? 's' : ''} (a chapter, and a question or a thing set in beside it), and once the book was whole they spent about ${after} more: a reader of the whole book (2 calls), a chapter or two written again, a few lines changed (1 each; looking with find is free). `
      + (left >= need + after ? `You have ${left}: room for all of that and ${left - need - after} over.` : left >= need ? `You have ${left}: enough for the chapters, and ${left - need} for what comes after.` : left >= todo.length ? `You have ${left}: enough to write each of them once, with ${left - todo.length} to spare, if little else is done.` : `You have ${left}, which is fewer than the chapters still to write.`)
    : `the book is whole. Other authors spent about ${after} calls from here: a reader of the whole book (2), a chapter or two written again, a few lines changed (1 each; looking with find is free). You have ${left}${left <= 2 ? ': about enough for one last thing and to say done' : ''}.`;
  // What a reader would cost now, and what it would leave to act on what they say: one author spent its last four calls
  // on a third reader, was told of three real contradictions, and had nothing left to change a line with.
  const read = done.at(-1), had = read ? state.readings?.[read] || 0 : 0, fresh = read ? !state.answers.some(answer => answer.who === 'a reader' && answer.about === read && !answer.stale) : false;
  const price = 1 + (had === 0 ? 1 : had === 1 ? 3 : 5);
  const reader = read && fresh ? ` A reader of the book through ${read} would now take ${price} calls in all (your answer and the reader)${left >= price ? `, and leave ${left - price} to act on what they say` : ', which is more than you have'}.` : '';
  return `${where}\nWHAT IS LEFT, going by other books written at this desk (a guide, not a rule): ${ahead}${reader}`;
}

/** Everything the author sees before it decides its next step. */
export function deskView(state: DeskState, chapters: number, result: string): string {
  const unwritten = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1)).filter(name => !state.files[name]?.trim());
  const left = state.budget - state.spent;
  return (result ? `RESULT OF YOUR LAST TOOL:\n${result}\n\n` : '')
    + `YOUR DESK NOW:\n${Object.entries(state.files).map(([name, text]) => `===== ${name} (${count(text)} words) =====\n${text || '(empty)'}`).join('\n\n')}`
    + `\n\nWHAT READERS AND CHARACTERS HAVE TOLD YOU (latest last):\n${state.answers.length ? state.answers.slice(-6).map(answer => `[${answer.who}, at step ${answer.step}${answer.about ? `, about ${answer.about}` : ''}${answer.stale ? ` — YOU HAVE CHANGED ${answer.about} SINCE: this was said of the text as it was then` : ''}]\n${answer.text}`).join('\n\n') : '(nothing yet)'}`
    + `\n\nYOUR STEPS SO FAR:\n${state.journal.length ? state.journal.slice(-40).join('\n') : '(nothing yet)'}`
    + `\n\nBUDGET LEFT: ${left} of ${state.budget} calls.${unwritten.length ? ` Not yet written: ${unwritten.join(', ')}.` : ' Every chapter has text.'}\n${whereYouAre(state, chapters)}\nYour next answer, in the form given:`;
}

/**
 * What a line hangs on that another line could contradict: the days, dates and hours it names, its numbers and spans
 * of time, and the names in it. Code picks these out; it does not know what they mean.
 */
const WHEN = /\b(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days?|January|February|March|April|May|June|July|August|September|October|November|December|mornings?|afternoons?|evenings?|nights?|noon|midnight|tonight|yesterday|tomorrow|\d{1,2}[:.]\d{2}|\d+(?:st|nd|rd|th)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|twenty|thirty|forty|fifty)(?:-\w+)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|weeks?|months?|years?)\b/gi;
export function anchorsOf(text: string): string[] {
  const when = (text.match(WHEN) || []).map(word => word.toLowerCase().replace(/s$/, ''));
  const names = [...text.matchAll(/(?<=[a-z,;:—–-]\s)[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?/g)].map(found => found[0].toLowerCase());
  return [...new Set([...when, ...names])].filter(word => word.length >= 2 && !/^(a|an|one|week|month|year|night)$/.test(word));
}
const lineBreaks = /(?<=[.!?…”"])\s+|\n+/;
/**
 * After a change: the other lines of the book that speak of the same day, hour, number or name as the changed line and
 * the lines beside it. One author changed "found that morning" to "the next morning" and stopped there; two lines away
 * the hotel had telephoned "on a Tuesday morning", and a chapter on a detective asked about "Tuesday afternoon, the
 * afternoon he died". Nobody says they disagree: they are set where the author can see them together.
 */
export function elsewhere(files: Record<string, string>, names: string[], changed: string, around: string, most = 6): Place[] {
  const all = names.flatMap(file => (files[file] || '').split(lineBreaks).map(line => ({ file, sentence: line.trim() })).filter(item => item.sentence.split(/\s+/).length >= 4));
  const has = (line: string, anchor: string) => new RegExp(`\\b${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(line);
  const lines = (anchor: string) => all.filter(item => has(item.sentence, anchor)).length;
  // A day of the week, a month or an hour of the clock places a thing in the book's calendar: lines that name the same
  // one come first. A word like "morning", a number or a name tells less; one that stands in a great many lines — the
  // heroine's name, the Thursday of a book about Thursdays — tells nothing, and is left out.
  const strong = (anchor: string) => /day$|^(january|february|march|april|may|june|july|august|september|october|november|december)$|^\d{1,2}[:.]\d{2}$/.test(anchor);
  const anchors = anchorsOf(around).filter(anchor => { const count = lines(anchor); return count >= 1 && count <= (strong(anchor) ? 12 : 8); });
  if (!anchors.length) return [];
  const own = new Set(anchorsOf(changed));
  return all.filter(item => item.sentence !== changed.trim() && !changed.includes(item.sentence))
    .map((item, at) => { const shared = anchors.filter(anchor => has(item.sentence, anchor)); return { ...item, from: 0, to: 0, at, weight: shared.reduce((sum, anchor) => sum + (strong(anchor) ? 3 : 1) * (own.has(anchor) ? 2 : 1) / Math.sqrt(lines(anchor)), 0) }; })
    .filter(item => item.weight > 0).sort((one, other) => other.weight - one.weight).slice(0, most).sort((one, other) => one.at - other.at);
}

const COMMON = new Set(`that this with from have what when were they them their there then than would could should about which while where your been into just only over like back down still even more some very much also after before again never always because through thing things something nothing anything everything every other another these those being himself herself itself myself said says know knew known think thought looked look looking face hand hands eyes door room time times day days way made make came come went going gone want wanted told tell asked left right long little first last next same each both away around between under without against during until since toward towards didn't don't wasn't couldn't wouldn't hadn't isn't it's he's she's you've you're i've i'm that's there's what's can't won't found gave given took taken felt feel seemed turned stood heard kept held began called answered moment minute hour hours morning afternoon evening night week weeks month months year years woman man people person place house`.split(/\s+/));
const stem = (word: string) => word.replace(/(?:'s|ing|ed|es|s)$/, '');
/**
 * The words a chapter leans on that no earlier chapter has: said three times or more here, never before. One book's
 * third chapter turned on a key left "under the lamp, where she always leaves it"; the lamp was named seven times in
 * that chapter and not once in the two before, and a reviewer said the proof arrived with its explanation. Code
 * counts; a new word is not a fault. People's names are left out: a new person is plain to see.
 */
export function newWords(chapter: string, earlier: string[], most = 8): string[] {
  const before = new Set((earlier.join('\n').toLowerCase().match(/[a-z']{4,}/g) || []).map(stem));
  const counts = new Map<string, number>(), lower = new Map<string, number>();
  for (const found of chapter.matchAll(/[A-Za-z']{4,}/g)) { const word = found[0].toLowerCase(); counts.set(word, (counts.get(word) || 0) + 1); if (found[0] === word) lower.set(word, (lower.get(word) || 0) + 1); }
  // A thing, not a turn of speech: the word stands after "the", "a", "her", "his" at least twice.
  const named = (word: string) => (chapter.match(new RegExp(`\\b(?:the|a|an|his|her|their|my|your|its|that|this)\\s+(?:\\w+\\s+)?${word.replace(/'/g, "'")}\\b`, 'gi')) || []).length >= 2;
  return [...counts].filter(([word, times]) => times >= 3 && !COMMON.has(word) && !before.has(stem(word)) && (lower.get(word) || 0) > 0 && named(word))
    .sort((one, other) => other[1] - one[1]).slice(0, most).map(([word, times]) => `${word} (${times})`);
}

/** A place in the book where the author's quoted words stand: the file, the span, and the whole sentence around it. */
export interface Place { file: string; from: number; to: number; sentence: string }
const quoted = (text: string) => text.trim().replace(/^["“‘'…*_\s]+|["”’'…*_\s]+$/g, '');
const sentenceAt = (text: string, from: number, to: number): string => {
  const start = Math.max(text.lastIndexOf('\n', from - 1) + 1, ...['. ', '! ', '? ', '." ', '.” ', '?” ', '!” '].map(end => { const at = text.lastIndexOf(end, from - 1); return at < 0 ? 0 : at + end.length; }));
  const ends = ['. ', '! ', '? ', '." ', '.” ', '?” ', '!” ', '\n'].map(end => { const at = text.indexOf(end, Math.max(to - 1, from)); return at < 0 ? -1 : at + end.trimEnd().length; }).filter(at => at >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length).trim();
};
/**
 * Every place the quoted words stand, in the files named. Code, not a reader: letters and digits must match, while
 * capitals, the shape of quotation marks and dashes, and how the line is broken do not count.
 */
export function findPlaces(files: Record<string, string>, names: string[], words: string, most = 40): Place[] {
  // The marks of italics are not words: a line the page has as *Thursday. He comes home late.* is found with or without them.
  const bits = quoted(words).split(/\s+/).map(bit => bit.replace(/^[*_]+|[*_]+$/g, '')).filter(Boolean); if (!bits.length || bits.join('').length < 3) return [];
  const loose = bits.map(bit => bit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/["“”]/g, '["“”]').replace(/['‘’]/g, "['‘’]").replace(/[-–—]/g, '[-–—]')).join('[*_]*\\s+[*_]*');
  const edge = (bit: string, side: 'start' | 'end') => /[A-Za-z0-9]/.test(side === 'start' ? bit[0] : bit.at(-1)!) ? '\\b' : '';
  // Quoted to the middle of a word — "She ha…" for "She has" — the words are still found: the end need not fall on a word's end.
  const whole = new RegExp(edge(bits[0], 'start') + loose + edge(bits.at(-1)!, 'end'), 'gi'), open = new RegExp(edge(bits[0], 'start') + loose, 'gi');
  const pattern = names.some(file => whole.test(files[file] || '')) ? whole : open, places: Place[] = []; whole.lastIndex = 0;
  // A quotation mark the author typed at either end belongs to the place when the page has one there.
  const raw = words.trim(), lead = /^["“‘']/.test(raw), tail = /["”’']$/.test(raw);
  for (const file of names) { const text = files[file] || ''; for (const found of text.matchAll(pattern)) {
    if (places.length >= most) return places;
    let from = found.index!, to = from + found[0].length;
    if (lead && /["“‘']/.test(text[from - 1] || '')) from--;
    if (tail && /["”’']/.test(text[to] || '')) to++;
    places.push({ file, from, to, sentence: sentenceAt(text, from, to) });
  } }
  return places;
}
/**
 * The passage a long quotation is plainly of, when it does not stand word for word. An author quotes several sentences
 * from memory to change them, and one pronoun or a dropped clause is off: of every four changes one failed that way,
 * each time with the right place the first of the "nearest lines". Found by the runs of three words the quotation and
 * the page share: one stretch of the page must hold most of them and no other stretch more than a few. Its ends are
 * the quotation's ends where those match, and the ends of its sentences where the quotation's first or last words
 * are the ones that differ.
 */
export function nearPassage(files: Record<string, string>, names: string[], words: string): Place | undefined {
  const tokens = (text: string) => [...text.matchAll(/[A-Za-z0-9']+/g)].map(found => ({ word: found[0].toLowerCase(), from: found.index!, to: found.index! + found[0].length }));
  const quote = tokens(quoted(words)); if (quote.length < 8) return undefined;
  const gram = (list: { word: string }[], at: number) => `${list[at].word} ${list[at + 1].word} ${list[at + 2].word}`;
  const wanted = new Map<string, number>(); for (let at = 0; at + 2 < quote.length; at++) wanted.set(gram(quote, at), at);
  const stretches: { file: string; first: number; last: number; hits: Set<string>; page: ReturnType<typeof tokens> }[] = [];
  for (const file of names) {
    const page = tokens(files[file] || ''); let open: (typeof stretches)[number] | undefined;
    for (let at = 0; at + 2 < page.length; at++) {
      const key = gram(page, at); if (!wanted.has(key)) continue;
      if (open && at - open.last <= 14) { open.last = at; open.hits.add(key); } else { open = { file, first: at, last: at, hits: new Set([key]), page }; stretches.push(open); }
    }
  }
  stretches.sort((one, other) => other.hits.size - one.hits.size);
  const best = stretches[0]; if (!best || best.hits.size < wanted.size * 0.6 || (stretches[1]?.hits.size || 0) > best.hits.size * 0.4) return undefined;
  const text = files[best.file]; let from = best.page[best.first].from, to = best.page[best.last + 2].to;
  // Where the quotation's first words are not the page's, the place begins with the sentence; likewise its end.
  const lead = wanted.get(gram(best.page, best.first))!, tail = quote.length - 3 - wanted.get(gram(best.page, best.last))!;
  if (lead > 0 && lead <= 4) { const start = Math.max(text.lastIndexOf('\n', from - 1) + 1, ...['. ', '! ', '? ', '.” ', '." ', '?” ', '!” '].map(end => { const at = text.lastIndexOf(end, from - 1); return at < 0 ? 0 : at + end.length; })); if (text.slice(start, from).trim().split(/\s+/).filter(Boolean).length <= lead + 2) from = start; }
  if (tail > 0 && tail <= 4) { const ends = ['. ', '! ', '? ', '.” ', '." ', '?” ', '!” ', '\n'].map(end => { const at = text.indexOf(end, to); return at < 0 ? -1 : at + end.trimEnd().length; }).filter(at => at >= 0); const stop = ends.length ? Math.min(...ends) : text.length; if (text.slice(to, stop).trim().split(/\s+/).filter(Boolean).length <= tail + 2) to = stop; }
  else if (/[.!?…]["”’]?$/.test(quoted(words)) && /^[.!?…]["”’]?/.test(text.slice(to, to + 2))) to += (text.slice(to).match(/^[.!?…]["”’]?/)?.[0].length || 0);
  return { file: best.file, from, to, sentence: text.slice(from, to) };
}
/** When the words stand nowhere: the sentences that share most with them, so the author can see what the page has instead. */
export function nearestTo(files: Record<string, string>, names: string[], words: string, most = 3): Place[] {
  const wanted = wordsOf(words); if (wanted.size < 2) return [];
  const ranked: (Place & { share: number })[] = [];
  for (const file of names) for (const sentence of (files[file] || '').split(/(?<=[.!?…”"])\s+|\n+/)) { const share = [...wordsOf(sentence)].filter(word => wanted.has(word)).length; if (share >= Math.min(3, Math.ceil(wanted.size / 2))) ranked.push({ file, from: 0, to: 0, sentence: sentence.trim(), share }); }
  return ranked.sort((one, other) => other.share - one.share).slice(0, most);
}
const shown = (places: Place[], most = 8) => places.slice(0, most).map(place => `— ${place.file}: "${place.sentence.length > 260 ? place.sentence.slice(0, 260) + '…' : place.sentence}"`).join('\n') + (places.length > most ? `\n— and ${places.length - most} more.` : '');

/**
 * Reflection: what a step did to the text, as it was and as it is. Made by code after every step that changes a
 * chapter, at no cost, and handed back with the step. It says nothing of whether the change is good.
 *
 * An author cannot see its own change. One meant to alter a single line, wrote the chapter out four times, and never
 * knew the line had changed the first time. Another wrote its last chapter three times to answer a reader, and the
 * chapter went from 2,900 words to 3,700 while it believed it was tightening. Another set an explanation into a chapter
 * in the first person, in a book told in the third, with a line of the chapter repeated beside it.
 */
const begins = (part: string, most = 110) => { const flat = part.replace(/\s+/g, ' ').trim(); return flat.length > most ? flat.slice(0, most).replace(/\s+\S*$/, '') + '…' : flat; };
export function reflect(was: string, now: string, file: string): string {
  if (!was.trim() || !/^chapter-/.test(file)) return '';
  const parts = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(part => part && !/^[-*_]{3,}$/.test(part));
  const old = parts(was), next = parts(now), before = new Set(old), after = new Set(next);
  const gone = old.filter(part => !after.has(part)), fresh = next.filter(part => !before.has(part)), kept = next.length - fresh.length;
  if (!gone.length && !fresh.length) return `\n\nWHAT THIS STEP DID: nothing. What you have just written is, paragraph for paragraph, what was already in ${file}. If you meant to change a line, it stands as it did.`;
  const size = `${count(was)} → ${count(now)} words`, head = `\n\nWHAT THIS STEP DID to ${file} (as it was → as it is): ${size}; ${kept} of its ${next.length} paragraphs stand as they did, ${gone.length} ${gone.length === 1 ? 'is' : 'are'} gone, ${fresh.length} ${fresh.length === 1 ? 'is' : 'are'} new.`;
  // A few paragraphs changed in place are shown side by side; a chapter mostly rewritten is shown by what left it and what came in.
  const pairs = gone.length === fresh.length && gone.length <= 3;
  const body = pairs ? gone.map((part, at) => `\nWas: "${begins(part, 260)}"\nIs:  "${begins(fresh[at], 260)}"`).join('')
    : `${gone.length ? `\nGone: ${gone.slice(0, 5).map(part => `"${begins(part)}"`).join('; ')}${gone.length > 5 ? `; and ${gone.length - 5} more` : ''}.` : ''}${fresh.length ? `\nNew: ${fresh.slice(0, 5).map(part => `"${begins(part)}"`).join('; ')}${fresh.length > 5 ? `; and ${fresh.length - 5} more` : ''}.` : ''}`;
  // What the chapter named and no longer names, and what it names now: days, hours, numbers, people.
  const named = (text: string) => new Set(anchorsOf(text)), then = named(was), today = named(now);
  const lost = [...then].filter(word => !today.has(word)).slice(0, 8), found = [...today].filter(word => !then.has(word)).slice(0, 8);
  const names = lost.length || found.length ? `\n${lost.length ? `It no longer names: ${lost.join(', ')}. ` : ''}${found.length ? `It now names, and did not: ${found.join(', ')}.` : ''}` : '';
  return head + body + names;
}
/** Reflection on a thing set in: how it now stands between the lines on either side of it, where a seam would show. */
const seam = (text: string, put: string): string => {
  const at = text.indexOf(put.trim()); if (at < 0) return '';
  const before = text.slice(0, at).trim().split(lineBreaks).at(-1) || '', behind = text.slice(at + put.trim().length).trim().split(lineBreaks)[0] || '';
  return `\n\nWHAT THIS STEP DID (as it now reads, with the lines on either side):\n…${before.slice(-220)}\n» ${begins(put, 420)}\n${behind.slice(0, 220) || '(the end of the chapter)'}…`;
};
const stepOf = (line: string) => Number(line.match(/^(\d+)\./)?.[1] || 0);
const wordsOf = (text: string) => new Set(text.toLowerCase().match(/[a-z']{4,}/g) || []);

/**
 * The mirror: whether the author is going round, said in its own steps. Not a rule and not a stop.
 * - a chapter written a third time or more: the steps that had to do with it, and how its length went;
 * - the keeper asked what it has been asked before: the earlier questions.
 * Each round is shown when it has grown since it was last shown, so the same news is not told twice.
 */
export function circling(state: DeskState, file: string, chapters: string[]): string {
  const shown = state.shown_rounds || (state.shown_rounds = {}), left = state.budget - state.spent;
  const unwritten = chapters.filter(chapter => !state.files[chapter]?.trim());
  const close = `You have ${left} call${left === 1 ? '' : 's'} left${unwritten.length ? `, and ${unwritten.join(', ')} ${unwritten.length > 1 ? 'are' : 'is'} not written yet` : ''}. Whether to go round again is yours to decide.`;
  if (chapters.includes(file)) {
    const about = state.journal.filter(line => line.includes(file) && /^\d+\. (wrote|appended to|planted in|changed in|a reader read through)/.test(line));
    const writes = about.filter(line => /^\d+\. wrote /.test(line));
    if (writes.length >= 3 && writes.length > (shown[file] || 0)) {
      shown[file] = writes.length;
      const sizes = writes.map(line => line.match(/\((\d+) words\)/)?.[1]).filter(Boolean);
      // What readers said between the passes is what sent it round: their steps are named with its own.
      const between = state.answers.filter(answer => answer.who.startsWith('a reader') && answer.step >= stepOf(writes[0])).map(answer => `${answer.step}. ${answer.who} said: ${answer.text.replace(/\s+/g, ' ').slice(0, 200)}…`);
      const steps = [...about.slice(-8).map(line => line.slice(0, 300)), ...between.slice(-3)].sort((one, other) => stepOf(one) - stepOf(other));
      return `\n\nYou have come round to ${file} again: this is time number ${writes.length} that you have written it. The steps that brought you here, in your own words:\n${steps.join('\n')}\nIts length went ${sizes.join(' → ')} words. ${close}`;
    }
    return '';
  }
  if (file === 'keeper') {
    const asked = state.answers.filter(answer => answer.who === 'the keeper' && answer.asked), last = asked.at(-1);
    if (!last) return '';
    const now = wordsOf(last.asked!), alike = asked.slice(0, -1).filter(answer => { const then = wordsOf(answer.asked!); const both = [...now].filter(word => then.has(word)).length; return both >= 5 && both / Math.min(now.size, then.size) >= 0.5; });
    if (alike.length >= 1 && alike.length + 1 > (shown.keeper || 0)) {
      shown.keeper = alike.length + 1;
      return `\n\nYou have asked the keeper much the same before:\n${alike.slice(-3).map(answer => `${answer.step}. you asked: ${answer.asked!.replace(/\s+/g, ' ').slice(0, 200)}\n   and were told: ${answer.text.replace(/^Q:[\s\S]*?\nA: /, '').replace(/\s+/g, ' ').slice(0, 220)}…`).join('\n')}\nThe book has not changed what it says since unless you changed it. ${close}`;
    }
  }
  return '';
}

/**
 * Carry out one step on the desk. Returns what the author is told about it.
 * `ask` is how a second mind is reached; it is counted against the budget by the caller.
 */
export async function takeStep(state: DeskState, step: ReturnType<typeof readStep>, chapters: number,
  ask: (kind: 'character' | 'reader', prompt: string, system: string) => Promise<string>): Promise<string> {
  const { tool, file, name, content, thought } = step;
  const note = (line: string) => { state.journal.push(`${state.step}. ${line}${thought ? ` — ${thought.slice(0, 220)}` : ''}`); };
  const chapterNames = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1));
  const isChapter = chapterNames.includes(file);
  const changed = () => { if (isChapter) for (const answer of state.answers) if (answer.who === 'a reader' && chapterNames.indexOf(answer.about) >= chapterNames.indexOf(file)) answer.stale = true; };

  // Not a check and not advice: what a reader who has just closed the book is still holding.
  // It comes once, the moment the last chapter has text, while there are still calls to do something about it.
  const hanging = async (lead: string): Promise<string> => {
    const whole = chapterNames.map(chapter => state.files[chapter] || '');
    // The reader speaks as they turn to the last chapter, so the ending is written with every debt in view. Told after
    // the ending instead, the author wrote its last chapter four times over, and it grew from 1,700 words to 4,300.
    if (!state.told_promises && chapters > 1 && !whole.at(-1)!.trim() && whole.slice(0, -1).every(text => text.trim()) && state.budget - state.spent >= 2) {
      const said = await ask('reader', `${whole.slice(0, -1).join('\n\n')}\n\n---\nThat is a novel up to its last chapter, which you have not read yet. As a reader, in under 220 words, say what you are holding as you turn to the ending: every question the book has made you ask and not answered yet; every thing, person or threat it brought in with weight and has not used yet; anything it announced that has not happened yet; and anything it has told twice as if for the first time. For each, name the place where it was raised. Then one line: what you most want to be in the room for when it ends.`,
        'You are an ordinary reader. You are not a writer or an editor: you say what you are holding, and you never say how to fix anything.');
      state.told_promises = true; state.answers.push({ who: 'a reader about to read the ending', step: state.step, about: '', text: said });
      state.journal.push(`${state.step}. the book was written up to its last chapter, and a reader said what they were holding`);
      return `Every chapter but the last now has text. Someone has read the book up to here, and says what they are holding as they turn to the ending:\n${said}\n\nThat cost one call; you have ${state.budget - state.spent} left. What you do about any of it is yours to decide.`;
    }
    if (chapters > 1) { if (whole.every(text => text.trim())) state.told_promises = true; return ''; }
    if (state.told_promises || whole.some(text => !text.trim()) || state.budget - state.spent < 2) return '';
    const said = await ask('reader', `${whole.join('\n\n')}\n\n---\nYou have just finished this novel. As a reader, in under 200 words, say what it left in your hands: every question it made you ask and never answered; every thing, person or threat it brought in with weight and then never used; anything it announced that did not happen. For each, name the place where it was raised. If nothing was left hanging, say so in a sentence.`,
      'You are an ordinary reader. You are not a writer or an editor: you say what you were left holding, and you never say how to fix anything.');
    state.told_promises = true; state.answers.push({ who: 'a reader who has finished the book', step: state.step, about: '', text: said });
    state.journal.push(`${state.step}. the book was whole for the first time, and a reader said what it left hanging`);
    return `${lead}\n${said}\n\nThat cost one call; you have ${state.budget - state.spent} left. What you do about any of it is yours to decide.`;
  };
  if (tool === 'done') {
    const told = await hanging('Before it goes to the printer, a reader who has just finished the book says what it left in their hands:');
    if (told) return `${told} Say done again and the book is printed as it stands.`;
    state.finished = true; note('done'); return '';
  }
  if ((['write', 'append'].includes(tool) || (['plant', 'change', 'edit', 'find'].includes(tool) && file && !/^(the )?(whole )?(book|all|chapters|everywhere|any)$/i.test(file))) && !(file in state.files)) { note(`${tool} ${file}: no such file`); return `There is no file "${file}". Your files: ${Object.keys(state.files).join(', ')}.`; }
  // What code can count about a chapter that has just been written, handed back with it.
  const counted = (): string => {
    if (!isChapter) return '';
    const worn = wornPhrases(chapterNames.map(chapter => state.files[chapter] || ''), 8);
    const times = (text: string) => [...new Set(text.match(/\b(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|(?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{1,2}(?:st|nd|rd|th)?)?|(?:the )?(?:\w+-)?\w+(?:st|nd|rd|th) of \w+|\d{1,2}[:.]\d{2}(?: ?[ap]\.?m\.?)?|(?:nineteen|twenty)[ -]\w+(?:[ -]\w+)?|(?:19|20)\d{2})\b/g) || [])].slice(0, 24);
    const here = times(state.files[file]), earlier = chapterNames.slice(0, chapterNames.indexOf(file)).map(chapter => `${chapter}: ${times(state.files[chapter] || '').join(', ') || 'none'}`);
    const spans = spansOf(state.files[file]), spansBefore = chapterNames.slice(0, chapterNames.indexOf(file)).map(chapter => ({ chapter, named: spansOf(state.files[chapter] || '') })).filter(item => item.named.length).map(item => `${item.chapter}: ${item.named.join(', ')}`);
    const last = state.files[file].split(/\n\s*\n/).at(-1) || '';
    // A reader's question that got into the prose: one book told its own reader, three times, about "the question the reader will ask".
    const outside = state.files[file].split(lineBreaks).map(line => line.trim()).filter(line => /\b(?:the|a|any|every) readers?\b|\breaders? will\b/i.test(line) && !/\b(?:lip|palm|mind|meter|card)[- ]readers?\b/i.test(line));
    const leans = chapterNames.indexOf(file) > 0 ? newWords(state.files[file], chapterNames.slice(0, chapterNames.indexOf(file)).map(chapter => state.files[chapter] || '')) : [];
    return (/[.!?…"”’')\]—–-]\s*[*_]*$/.test(last.trim()) ? '' : ' It stops in the middle of a sentence.')
      + (here.length ? `\nDays, dates and hours it names: ${here.join(', ')}.${earlier.length ? ` Earlier chapters named — ${earlier.join(' | ')}.` : ''}` : '')
      + (spans.length ? `\nAges and spans of time it names: ${spans.join(', ')}.${spansBefore.length ? ` Earlier chapters named — ${spansBefore.join(' | ')}.` : ''}` : '')
      + (leans.length ? `\nWords it leans on that no earlier chapter has: ${leans.join(', ')}.` : '')
      + (outside.length ? `\nIt speaks of "the reader" ${outside.length} time${outside.length === 1 ? '' : 's'}, from outside the story: ${outside.slice(0, 3).map(line => `"${line.length > 150 ? line.slice(0, 150) + '…' : line}"`).join('; ')}.` : '')
      + (worn.length ? `\nTurns of phrase the book has now used three times or more: ${worn.join('; ')}.` : '');
  };
  const whole = async () => { const told = isChapter ? await hanging('Every chapter now has text. Someone has read the book through, and says what it left in their hands:') : ''; return told ? `\n\n${told}` : ''; };
  if (tool === 'write') { const was = state.files[file] || ''; state.files[file] = isChapter ? cleanChapter(ownWords(content)) : ownWords(content); changed(); note(`wrote ${file} (${count(state.files[file])} words)`); return `${file} is written: ${count(state.files[file])} words.${counted()}${await whole()}${reflect(was, state.files[file], file)}${circling(state, file, chapterNames)}`; }
  if (tool === 'append') { const next = (state.files[file] + '\n\n' + ownWords(content)).trim(); state.files[file] = isChapter ? cleanChapter(next) : next; changed(); note(`appended to ${file} (now ${count(state.files[file])} words)`); return `${file} is now ${count(state.files[file])} words.${counted()}${await whole()}`; }
  // Every tool that touches the text at a place looks for the place first; and looking is a tool of its own.
  const written = chapterNames.filter(chapter => state.files[chapter]?.trim());
  const scope = file in state.files ? [file] : written;
  // What a reader said was said of the text as it was: after a line is changed or a thing set in, it is marked so, and a
  // reader asked again is a new reader at the next price. Told that "nothing has changed since" after changing three
  // chapters, one author asked for a reader three times running and got the old answer each time.
  const stale = (touched: string) => { for (const answer of state.answers) if (answer.who === 'a reader' && chapterNames.indexOf(answer.about) >= chapterNames.indexOf(touched)) answer.stale = true; };
  // The one place the quoted words stand, or what the author is told when there is not exactly one.
  let loose = false;
  const place = (given: string, doing: string): Place | string => {
    // "PLACE: 2" on a first line picks the second of several places: the same paragraph printed twice can be told apart no other way.
    const which = Number(given.match(/^\s*PLACE\s*:?\s*#?(\d+)\s*\n/i)?.[1] || 0), words = given.replace(/^\s*PLACE\s*:?\s*#?\d+\s*\n/i, '');
    const places = findPlaces(state.files, scope, words);
    if (places.length === 1) return places[0];
    if (which >= 1 && which <= places.length) return places[which - 1];
    if (places.length > 1) return `Nothing was ${doing}: "${quoted(words).slice(0, 80)}" stands in ${places.length} places${file in state.files ? ` in ${file}` : ''}.\n${places.slice(0, 8).map((found, at) => `— PLACE ${at + 1}, ${found.file}: "${found.sentence.slice(0, 220)}${found.sentence.length > 220 ? '…' : ''}"`).join('\n')}\nQuote a little more of the one you mean; or, if the same words stand more than once and you mean one of them, put a first line above them saying which, like PLACE: 2.`;
    if (doing === 'changed') { const passage = nearPassage(state.files, scope, words); if (passage) { loose = true; return passage; } }
    const near = nearestTo(state.files, scope, words);
    return `Nothing was ${doing}: the ${count(words)} words you quoted, beginning "${quoted(words).slice(0, 80)}", do not stand ${file in state.files ? `in ${file}` : 'anywhere in the chapters'} as you quoted them.${near.length ? ` The lines nearest to it:\n${shown(near)}\nQuote the words as they stand.` : ''}`;
  };
  // Part of the mirror: words just put into the book that now stand in it more than once. One author set the same
  // paragraph into a chapter at two steps running, and a reader later found it printed twice.
  const twice = (put: string, into: string): string => {
    const head = (put.trim().split(/(?<=[.!?…”"])\s+/)[0] || '').trim();
    if (count(head) < 7) return '';
    const places = findPlaces(state.files, written, head);
    return places.length > 1 ? `\n\n"${head.slice(0, 90)}${head.length > 90 ? '…' : ''}" now stands ${places.length} times in the book (${[...new Set(places.map(found => found.file))].join(', ')}). If one of them should go, change can take it out: a first line PLACE: ${places.length} above the words picks the last.` : '';
  };
  if (tool === 'find') {
    const words = ownWords(content);
    if (quoted(words).length < 3) {
      // With nothing to look for, find shows what stands in the book more than once: an author told that "a paragraph
      // is printed twice" cannot quote it until it knows which, and two of them hunted for one through eight answers.
      const seen = new Map<string, string[]>();
      for (const chapter of scope.filter(name => chapterNames.includes(name))) for (const part of (state.files[chapter] || '').split(/\n\s*\n/).flatMap(block => [...new Set(count(block) > 60 ? [block.trim(), ...block.trim().split(/(?<=[.!?…”"])\s+/).map(line => line.trim())] : [block.trim()])])) if (count(part) >= 9) seen.set(part, [...(seen.get(part) || []), chapter]);
      const repeats = [...seen].filter(([, where]) => where.length > 1).sort((one, other) => other[0].length - one[0].length).filter(([part], at, all) => !all.slice(0, at).some(([longer]) => longer.includes(part))).slice(0, 8);
      note(`looked for what stands twice${file in state.files ? ` in ${file}` : ''}: ${repeats.length}`);
      return repeats.length ? `Standing more than once${file in state.files ? ` in ${file}` : ' in the book'}, word for word:\n${repeats.map(([part, where]) => `— ${where.length} times (${[...new Set(where)].join(', ')}), ${count(part)} words: "${part.slice(0, 200)}${part.length > 200 ? '…' : ''}"`).join('\n')}\nchange takes one of them out: quote it, with a first line PLACE: 2 above to pick the second.`
        : `No paragraph or long sentence stands twice${file in state.files ? ` in ${file}` : ' in the book'}, word for word.`;
    }
    const places = findPlaces(state.files, scope, words), near = places.length ? [] : nearestTo(state.files, scope, words);
    // A look knows what the author has changed since it last looked. Looked for again after a change, the words are
    // shown as they stand now, and it is said what is different: that is checking, not going round. Only a look that
    // shows the very same thing a third time is said to be the same look: one author looked for "Tuesday" seven times
    // running with nothing changed between.
    const key = `${quoted(words).toLowerCase()}|${file in state.files ? file : ''}`, sight = places.map(found => `${found.file}:${found.sentence}`).join('\n');
    const last = state.looks?.[key], steps = last && last.sight === sight ? [...last.steps, state.step] : [state.step];
    const round = !last ? '' : last.sight !== sight ? `\n\nSince you last looked for this, at step ${last.steps.at(-1)}, the book has changed here: it stood in ${last.count} place${last.count === 1 ? '' : 's'} then, and stands in ${places.length} now.`
      : steps.length >= 3 ? `\n\nYou have looked for this ${steps.length} times (at steps ${steps.join(', ')}) and it has shown the same each time: nothing where you are looking has changed since.` : '';
    state.looks = { ...(state.looks || {}), [key]: { steps, count: places.length, sight } };
    note(`looked for "${quoted(words).slice(0, 60)}"${file in state.files ? ` in ${file}` : ''}: ${places.length} place${places.length === 1 ? '' : 's'}`);
    return (places.length ? `"${quoted(words).slice(0, 80)}" stands in ${places.length} place${places.length === 1 ? '' : 's'}${file in state.files ? ` in ${file}` : ''}:\n${shown(places, 20)}`
      : `"${quoted(words).slice(0, 80)}" does not stand ${file in state.files ? `in ${file}` : 'anywhere in the chapters'}.${near.length ? ` The lines nearest to it:\n${shown(near)}` : ''}`) + round;
  }
  if (tool === 'change' || tool === 'edit') {
    const whole = ownWords(content), parted = /(?:^|\n)={3,}[ \t]*(?:\n|$)/.test(content.trimEnd());
    const [was = '', now = ''] = whole.split(/\n={3,}[ \t]*(?:\n|$)/);
    // Without the line of === there is no telling the words that stand from the words meant to replace them.
    if (!parted) { note(`change ${file}: no line of === in it`); return `Nothing was changed: there is no line containing only === in what you sent (${count(whole)} words), so the words as they stand cannot be told from the words that should replace them. Send the words as they stand, then a line containing only ===, then the new words (or nothing, to take them out).`; }
    if (quoted(was).length < 3) { note('change: no words quoted'); return 'change puts other words where words stand now. The content is the words as they stand, then a line containing only ===, then what should stand there instead.'; }
    if (count(now) > 220) { note(`change ${file}: too long`); return `That is ${count(now)} words to put in. change is for a line or a short passage, at most 200 words; what a chapter does is changed by writing it again.`; }
    const found = place(was, 'changed');
    if (typeof found === 'string') { note(`change ${file || 'the book'}: ${/stands in \d+ places/.test(found) ? 'the words stand in several places' : 'the words were not found'}`); return found; }
    const text = state.files[found.file], next = (text.slice(0, found.from) + now.trim() + text.slice(found.to)).replace(/[ \t]{2,}/g, ' ').replace(/ ([.,;!?])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
    state.files[found.file] = next; stale(found.file);
    const after = now.trim() ? sentenceAt(next, found.from, found.from + now.trim().length) : '(taken out)';
    // What a long change did cannot be seen in a clipped sentence: its size is said, and what now stands on either side of it.
    const out = count(text.slice(found.from, found.to)), put = count(now), ends = (passage: string) => passage.length > 300 ? `${passage.slice(0, 170)} […] ${passage.slice(-90)}` : passage;
    const beside = () => { const at = Math.min(found.from, next.length), till = Math.min(found.from + now.trim().length, next.length); const before = next.slice(0, at).trim().split(/(?<=[.!?…”"])\s+|\n+/).at(-1) || '', behind = next.slice(till).trim().split(/(?<=[.!?…”"])\s+|\n+/)[0] || ''; return `\nBefore it now stands: "${before.slice(-200) || '(the start of the chapter)'}"\nAfter it now stands: "${behind.slice(0, 200) || '(the end of the chapter)'}"`; };
    state.inserts = [...(state.inserts || []), { step: state.step, file: found.file, kind: 'change', at: found.sentence.slice(0, 400), text: after.slice(0, 600) }];
    note(`changed in ${found.file}: "${quoted(was).slice(0, 50)}" → "${now.trim().slice(0, 50) || '(taken out)'}"`);
    // The lines beside the change, as they now stand, and what the rest of the book says of the same days, hours, numbers and names.
    const about = next.slice(Math.max(0, found.from - 320), found.from + now.trim().length + 320);
    // The day the scene stands in is the last one named before the place, however far up the chapter that was.
    const day = [...next.slice(0, found.from).matchAll(/\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b|\b(?:January|February|March|April|June|July|August|September|October|November|December)\b/g)].at(-1)?.[0] || '';
    const other = elsewhere(state.files, written, now.trim() ? after : found.sentence, `${found.sentence} ${about} ${day}`);
    const also = other.length ? `\n\nElsewhere the book speaks of the same day, hour, number or name (your own lines; nobody has judged them):\n${shown(other)}` : '';
    // Found by likeness, not word for word: the author is shown in full what was taken as the place.
    if (loose) return `Changed in ${found.file}. The words did not stand exactly as you quoted them; this passage, which is plainly the one you meant, was taken as the place: ${out} words taken out, ${put} put in.\nTaken out: "${text.slice(found.from, found.to).trim().slice(0, 700)}"\n${put ? `Put in: "${now.trim().slice(0, 700)}"` : 'Nothing put in.'}${beside()}${also}${twice(now, found.file)}`;
    if (out <= 25 && put <= 25) return `Changed in ${found.file}, at the one place.\nIt read: "${found.sentence.slice(0, 400)}"\nIt now reads: "${after.slice(0, 400)}"${also}${twice(now, found.file)}`;
    return `Changed in ${found.file}, at the one place: ${out} words taken out, ${put} put in.\nTaken out: "${ends(text.slice(found.from, found.to).trim())}"\n${put ? `Put in: "${ends(now.trim())}"` : 'Nothing put in.'}${beside()}${twice(now, found.file)}`;
  }
  if (tool === 'plant') {
    const [where = '', what] = ownWords(content).split(/\n={3,}[ \t]*\n/);
    if (!what?.trim() || quoted(where).length < 3) { note(`plant ${file}: nothing to set in`); return 'plant sets one thing into a written chapter. The content is a few words of the paragraph it goes after, quoted as they stand, then a line containing only ===, then the new text.'; }
    if (count(what) > 150) { note(`plant ${file}: too long`); return `That is ${count(what)} words. A plant is one thing set down in passing, at most 120 words. To change the chapter itself, write it again.`; }
    if (file in state.files && (!isChapter || !state.files[file]?.trim())) { note(`plant ${file}: not a written chapter`); return `plant sets something into a chapter that is already written. ${file} is not one.`; }
    // A paragraph is named by how it begins; if a long quotation drifts from the page, its first sixty characters are tried.
    let found = place(where, 'set in');
    if (typeof found === 'string' && /does not stand/.test(found) && quoted(where).length > 60) { const head = place(quoted(where).slice(0, 60).replace(/\s+\S*$/, ''), 'set in'); if (typeof head !== 'string') found = head; }
    if (typeof found === 'string') { note(`plant ${file || 'the book'}: ${/stands in \d+ places/.test(found) ? 'the words stand in several places' : 'place not found'}`); return found; }
    const text = state.files[found.file], end = text.indexOf('\n\n', found.to), cut = end < 0 ? text.length : end;
    const before = text.slice(Math.max(0, text.lastIndexOf('\n\n', found.from)), cut).trim();
    state.files[found.file] = `${text.slice(0, cut)}\n\n${what.trim()}${text.slice(cut)}`; stale(found.file);
    state.inserts = [...(state.inserts || []), { step: state.step, file: found.file, kind: 'plant', at: before.slice(0, 200), text: what.trim() }];
    note(`planted in ${found.file}`); return `Set into ${found.file} after "${before.slice(0, 70)}…".${seam(state.files[found.file], what)}${twice(what, found.file)}`;
  }
  if (tool === 'ask_keeper') {
    if (state.budget - state.spent < 1) { note('ask_keeper: no budget'); return 'There is no budget left for a second call.'; }
    const book = chapterNames.filter(chapter => state.files[chapter]?.trim()).map(chapter => `[${chapter}]\n${state.files[chapter]}`).join('\n\n');
    if (!book) { note('ask_keeper: nothing written'); return 'There is nothing written yet for the keeper to look in.'; }
    const said = await ask('character', `${book}\n\n---\nQUESTION: ${content.trim()}`, 'You keep the continuity of a novel. You are given the chapters written so far and one question of fact. Answer only from what is on the page, in under 150 words: say what the text says, in which chapter, and quote the line. If the text says two different things, quote both and say so. If it does not say, say that it does not say. Do not judge the writing and do not suggest anything.');
    state.answers.push({ who: 'the keeper', step: state.step, about: '', asked: content.trim(), text: `Q: ${content.trim().slice(0, 200)}\nA: ${said}` }); note(`asked the keeper: ${content.trim().slice(0, 80)}`); return `The keeper says:\n${said}${circling(state, 'keeper', chapterNames)}`;
  }
  if (tool === 'ask_character') {
    if (state.budget - state.spent < 1) { note('ask_character: no budget'); return 'There is no budget left for a second call.'; }
    const said = await ask('character', content, `You are ${name || 'a person'} in a novel, and you do not know you are in one. You know only what you are told below. Answer in the first person, as yourself, plainly and specifically: what you do, what you say, what you will not say. You look after your own interests. Under 250 words.`);
    state.answers.push({ who: name || 'a character', step: state.step, about: '', asked: content.trim(), text: said }); note(`asked ${name}`); return `${name} answers:\n${said}`;
  }
  if (tool === 'ask_reader') {
    const written = chapterNames.filter(chapter => state.files[chapter]?.trim());
    if (!written.length) { note('ask_reader: nothing written'); return 'There is nothing written for a reader to read yet.'; }
    const target = isChapter && state.files[file]?.trim() ? file : written.at(-1)!;
    // A reader who has read this text has read it: the same answer, and nothing spent.
    const already = [...state.answers].reverse().find(answer => answer.who === 'a reader' && answer.about === target && !answer.stale);
    if (already) { note(`a reader had already read ${target} as it stands`); return `A reader has already read the book through ${target} as it now stands, at step ${already.step}. Nothing in it has changed since, so there is nothing new for a reader to say. They said:\n${already.text}`; }
    const had = state.readings?.[target] || 0, price = had === 0 ? 1 : had === 1 ? 3 : 5;
    if (state.budget - state.spent < price) { note(`ask_reader ${target}: costs ${price}, not enough budget`); return `Another reader for ${target} costs ${price} calls and you have ${state.budget - state.spent}.`; }
    const upTo = chapterNames.indexOf(target), last = upTo + 1 >= chapters;
    const book = chapterNames.slice(0, upTo + 1).map(chapter => state.files[chapter]).filter(text => text.trim()).join('\n\n');
    const said = await ask('reader', `${book}\n\n---\nThat is ${last ? 'a whole short novel' : `the first ${upTo + 1} chapter${upTo ? 's' : ''} of a novel`} you picked up in a shop. You know nothing else about it.${content.trim() ? ' The author asks: ' + content.trim() : ''}\nAnswer as a reader, in under 220 words, in three parts. WAITING FOR: ${last ? 'whether the ending gave you what the book made you wait for, and what it left you with' : 'what you are waiting to find out, and what you expect to happen'}. SLIPPED: the exact place in the last chapter where your attention slipped, or nowhere. DOES NOT ADD UP: anything that contradicts what came before — a day or hour, a place, who has which thing, who knew what, who could have done it — or anything the book tells twice as if for the first time, the same meeting or telephone call or discovery in two chapters; or nothing.`,
      'You are an ordinary reader. You are not a writer or an editor: you say what you felt and what you noticed, and you never say how to fix anything.');
    state.spent += price - 1; state.readings = { ...(state.readings || {}), [target]: had + 1 };
    state.answers.push({ who: 'a reader', step: state.step, about: target, asked: content.trim(), text: said }); note(`a reader read through ${target}${price > 1 ? ` (reader ${had + 1} of this chapter, ${price} calls)` : ''}`); return `The reader says:\n${said}`;
  }
  note('an answer that used no tool');
  return `"${tool}" is not one of your tools. Answer in the form given, with one of: write, append, plant, change, find, ask_character, ask_keeper, ask_reader, done.`;
}

/**
 * Calls the author has for a book: room to think, write each chapter, ask a few people, and
 * go back once or twice — and no more. With 68 calls for six chapters it had the whole book on
 * its desk after five and spent the other sixty on the last chapter, reader after reader, until
 * that chapter had doubled in length and lost a paragraph. The first chapters, written in one
 * or two passes, were the clean ones. The budget is the only brake it has, and it counts it.
 */
export const deskBudget = (chapters: number): number => 6 + chapters * 3;

export const newDesk = (chapters: number): DeskState => ({ files: Object.fromEntries([...NOTES, ...Array.from({ length: chapters }, (_, at) => chapterFile(at + 1))].map(name => [name, ''])),
  answers: [], journal: [], step: 0, budget: deskBudget(chapters), spent: 0, finished: false });

/**
 * Let the author work until it says it is done or its budget is spent. The desk is saved
 * after every step, so a book that is stopped goes on from the step it was at.
 */
export async function writeAtDesk(input: ProjectInput, store: ProjectStore, llm: NovelLLM,
  progress: (stage: string, chapter?: number) => void = () => {}): Promise<void> {
  const chapters = input.chapter_count, words = Math.max(300, Math.round(input.target_total_words / chapters));
  const names = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1));
  let draft: AuthorDraft = store.loadAuthor() || { version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false };
  const desk: DeskState = draft.desk || newDesk(chapters);
  const system = voice(input, words, Object.keys(desk.files));
  let saved = names.map(name => desk.files[name] || '');

  const save = () => {
    draft = { ...draft, desk, notebook: desk.files['notebook.md'], plan: desk.files['plan.md'], clock: desk.files['dossier.md'],
      chapters: names.map((name, at) => ({ text: desk.files[name] || '', card: '', facts: '', reader: desk.answers.filter(answer => answer.who === 'a reader' && answer.about === name).at(-1)?.text || '' }))
        .slice(0, Math.max(0, names.reduce((last, name, at) => desk.files[name]?.trim() ? at + 1 : last, 0))),
      title: [desk.files['plan.md'], desk.files['notebook.md']].map(text => text.match(/^[#*\s]*TITLE\**\s*:\**\s*(.+)$/im)?.[1].replace(/[*_"“”]+/g, '').trim().slice(0, 90)).find(Boolean) || draft.title };
    store.saveAuthor(draft);
    names.forEach((name, at) => { if ((desk.files[name] || '') !== saved[at] && desk.files[name]?.trim()) store.saveManuscript(at + 1, desk.files[name]); });
    saved = names.map(name => desk.files[name] || '');
  };

  let result = '';
  while (!desk.finished && desk.spent < desk.budget) {
    desk.step++; desk.spent++;
    let answer = '';
    try { answer = (await llm(deskView(desk, chapters, result), system, { stage: 'author-step', route: 'writer', temperature: 0.8, maxTokens: Math.max(12000, Math.ceil(words * 5)) })).trim(); }
    catch (error) {
      // An answer too long to finish is a step that did not happen, not the end of the book.
      const message = error instanceof Error ? error.message : String(error);
      if (!/token limit|incomplete response|repeating itself|blank space/i.test(message)) throw error;
      result = 'Your last answer was cut off before it ended, so none of it was carried out. It was too long: do less in one answer.';
      desk.journal.push(`${desk.step}. an answer too long to finish; nothing was done`); store.log('author', `[${desk.step}] answer cut off: ${message.slice(0, 160)}`); save(); continue;
    }
    const steps = readSteps(answer), told: string[] = []; let onlyLooked = false;
    for (const [index, step] of steps.entries()) {
      const at = names.indexOf(step.file);
      progress(at >= 0 ? 'chapter' : 'design', at >= 0 ? at + 1 : undefined);
      if (step.tool === 'done' && names.some(name => !desk.files[name]?.trim()) && desk.budget - desk.spent > 2) {
        // Not a rule about how to work: the book it was asked for is not on the desk yet.
        told.push(`The book is not finished: ${names.filter(name => !desk.files[name]?.trim()).join(', ')} ${names.filter(name => !desk.files[name]?.trim()).length > 1 ? 'have' : 'has'} no text.`);
        desk.journal.push(`${desk.step}. done — but chapters are still unwritten`);
      } else {
        told.push(await takeStep(desk, step, chapters, async (kind, prompt, persona) => {
          desk.spent++;
          // A reader is another head: the editor's model when the publisher has set one. A character and the keeper speak from inside the book, in the author's own.
          const call = (route: 'writer' | 'validator') => llm(prompt, persona, { stage: kind === 'reader' ? 'author-reader' : 'author-character', route, temperature: kind === 'reader' ? 0.7 : 0.9, maxTokens: 1200 });
          if (kind !== 'reader') return (await call('writer')).trim();
          // A reader who will not read the book (some will not read what is on the page) does not stop it: the author's own model reads instead.
          try { const said = (await call('validator')).trim(); if (said) return said; throw new Error('the reader said nothing'); }
          catch (error) { desk.journal.push(`${desk.step}. the other reader could not read it (${String(error instanceof Error ? error.message : error).slice(0, 120)}); the author's own model read instead`); return (await call('writer')).trim(); }
        }));
      }
      store.log('author', `[${desk.step}] ${step.tool || 'no tool'} ${step.file || step.name || ''} — ${step.thought.slice(0, 300)}`);
      // What was written after a look, other than another look, was written without seeing what the look showed. One
      // author put fourteen looks and three changes into one answer and wrote, between them, what it supposed each had found.
      if (step.tool === 'find' && steps.slice(index + 1).some(next => next.tool !== 'find')) {
        const more = steps.slice(index + 1).findIndex(next => next.tool !== 'find');
        for (const next of steps.slice(index + 1, index + 1 + more)) { told.push(await takeStep(desk, next, chapters, async () => '')); store.log('author', `[${desk.step}] find — ${next.thought.slice(0, 200)}`); }
        told.push(`You looked, and the ${steps.length - 1 - index - more} step(s) you wrote after looking were not carried out, because you had not seen what the look showed. Looks may share an answer with each other; what you do about them comes in your next.`); onlyLooked = true; break;
      }
      // What was written after a question was written without its answer: it is not carried out.
      if (/^ask_/.test(step.tool) && index < steps.length - 1) { told.push(`You asked, and the ${steps.length - 1 - index} step(s) you wrote after asking were not carried out, because you had not seen the answer.`); break; }
      // A chapter is the last step of its answer, as a question is: what comes back with it — the days it names,
      // the phrases worn thin, whoever speaks unasked — is seen before the next one is written. Several chapters in
      // one answer were written blind and cost one call for all of them, which is why the author took to it.
      if ((step.tool === 'write' || step.tool === 'append') && at >= 0 && index < steps.length - 1) { told.push(`A chapter is the last step of an answer: the ${steps.length - 1 - index} step(s) you wrote after ${step.file} were not carried out, because you had not seen what came back with it.`); break; }
      if (desk.finished) break;
    }
    // Looking costs nothing: an answer that only looked is given back its call — the first two in a row. One author,
    // with its book whole and two calls left, gave twelve answers running that each took "one free look, then I close",
    // and never closed: free, a look had become a way of not deciding. From the third in a row a look costs a call like
    // any other answer, and the author is told how many times running it has only looked.
    // A change or a plant that found no one place did nothing but show where the words stand: it is a look.
    const looked = steps.length > 0 && (onlyLooked || steps.every((step, at) => step.tool === 'find' || (['change', 'edit', 'plant'].includes(step.tool) && /^Nothing was (changed|set in)/.test(told[at] || ''))));
    desk.look_streak = looked ? (desk.look_streak || 0) + 1 : 0;
    if (looked && desk.look_streak <= 2 && (desk.free_looks || 0) < desk.budget) { desk.spent--; desk.free_looks = (desk.free_looks || 0) + 1; }
    else if (looked) told.push(`This is the ${desk.look_streak}${desk.look_streak === 3 ? 'rd' : 'th'} answer running in which you have only looked. Two looks in a row are free; from the third, an answer that only looks costs a call like any other, and this one did. You have ${desk.budget - desk.spent} left.`);
    result = told.filter(Boolean).join('\n\n');
    save();
    if (steps.some(step => names.includes(step.file))) store.checkpoint(`author-step-${desk.step}`);
  }

  const unwritten = names.filter(name => !desk.files[name]?.trim());
  const total = names.reduce((sum, name) => sum + count(desk.files[name] || ''), 0);
  const lastReader = desk.answers.filter(answer => answer.who === 'a reader').at(-1);
  draft.completed = true; save();
  store.saveReport({
    coverage: { material_examined: `${chapters - unwritten.length} of ${chapters} chapters, ${total} words, written by the author at its desk in ${desk.step} steps and ${desk.spent} calls.`, limitations: ['Nobody checked the book but the readers the author chose to ask.'] },
    findings: unwritten.map(name => ({ category: 'completeness', severity: 'major', description: `${name} was not written before the budget ran out.`, evidence_refs: [], reader_impact: 'The book is incomplete.', certainty: 'counted' })),
    central_resolution: { supported: !unwritten.length, evidence_refs: [], comment: lastReader ? `The last reader the author asked (through ${lastReader.about}): ${lastReader.text.slice(0, 600)}` : 'The author asked no reader.' },
    unresolved_major_promises: [], need_more_evidence: [],
    summary: `The book is written: ${chapters - unwritten.length} of ${chapters} chapters, ${total} words, in ${desk.step} steps.${desk.finished ? ' The author said it was done.' : ' The budget ran out.'}`,
    status: unwritten.length ? 'COMPLETE_WITH_WARNINGS' : 'COMPLETE',
  } as FinalReport);
}
