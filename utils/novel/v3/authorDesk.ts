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
 * - a chapter is changed by writing it again, or by setting one thing into it. There is no tool
 *   for patching a passage, because every seam, lost line and doubled paragraph came from one.
 * - a reader who has read a chapter has read it: asked again about the same text, the same
 *   answer comes back at no cost. A second reader for a rewritten chapter is dearer than the
 *   first, a third dearer still. It went round a chapter sixty times when readers were cheap.
 * - writing a chapter brings back what code can count: the turns of phrase the book has worn
 *   out, and the days and hours this chapter names beside those the earlier ones named, and
 *   the ages and spans of time it names beside theirs.
 * - there is someone to ask what the book already says, so that a fact is looked up, not guessed.
 * - a reader is another model than the author when one is set: the same head does not see what it wrote past.
 * - the book moves forward: a chapter is open while it is the last one written. And once, as the last chapter is
 *   about to be written, a reader of the book so far says what they are holding — what was promised
 *   and not given yet. One book raised the question of who knew the day of five deaths and never
 *   came back to it; another forged the heroine's own will and then forgot the threat.
 * Nothing here tells it what to do next. What is kept from the later versions is only what
 * informs it: an answer from a reader or a character stays on the desk until it is no longer
 * about the text as it stands, and says so when it is not; the journal of its own steps is
 * there to read; and it is told plainly how much budget is left.
 */
export interface DeskState {
  files: Record<string, string>;
  /** What readers and characters answered: who, at which step, about which chapter. */
  answers: { who: string; step: number; about: string; text: string; stale?: boolean; kind?: 'character'; /** What the author asked, in its own words. */ asked?: string }[];
  /** What was set into a written chapter with plant, and where. Kept for the screen; nothing reads it back. */
  inserts?: { step: number; file: string; kind: 'plant' | 'unfold'; at: string; text: string }[];
  /** Whether the author has been told, on saying done, what the book left hanging. */
  told_promises?: boolean;
  /** How many readers each chapter has had: the next one costs more. */
  readings?: Record<string, number>;
  /** Persisted limit: the ending may be replaced once after its first draft. */
  ending_rewrites?: number;
  reader_failures?: string[];
  /** The author's own chapter records: memory, never a keeper's judgement. */
  facts?: { file: string; step: number; text: string; stale?: boolean }[];
  interviews_required?: boolean;
  /** What the author has been reminded of once. A reminder is said once and then stands aside: nothing here can stop a book. */
  reminded?: string[];
  interview_cast?: string[];
  interview_budget?: number;
  causality_required?: boolean;
  plan_review?: { plan: string; questions: string };
  journal: string[];
  step: number;
  budget: number;
  spent: number;
  finished: boolean;
}

export const chapterFile = (n: number): string => `chapter-${n}.md`;
const NOTES = ['notebook.md', 'dossier.md', 'plan.md'];
const isCancellation = (error: unknown): boolean => error instanceof Error && (error.name === 'AbortError' || /cancelled|canceled/i.test(error.message));
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

const voice = (input: ProjectInput, words: number, files: string[]): string => `You are the author of a ${input.genre || 'novel'} that is meant to sell: a book a stranger opens in a shop and cannot put back. It is your book. ${input.author_interviews === false ? 'Nobody will tell you how to work, and nobody will check your work or correct it: what is on your desk when your budget runs out is what gets printed.' : 'Begin by interviewing the main characters; their choices are the basis of your plan. Then write your book. What is on your desk when your budget runs out is what gets printed.'}

THE PREMISE YOU WERE GIVEN:
${input.premise}
${input.author_requirements && input.author_requirements !== '(none)' ? `\nWHAT THE PUBLISHER PUT ON THE FORM:\n${input.author_requirements}\nAudience, tone, the ending and how intimate scenes are written are binding. Voice and tense are a suggestion: tell this story in the voice it is best told in.\n` : ''}
YOUR JOB: the whole story, complete, in ${input.chapter_count} chapters, in the files ${chapterFile(1)} to ${chapterFile(input.chapter_count)}. The publisher has a book of roughly ${input.target_total_words} words in mind; a chapter is as long as it needs to be, and none is ever padded or cut to a size. It begins, turns, gets worse and ends inside these chapters: the last page of the last chapter is the end of the book. The book is written once and moves forward: a chapter, once written, goes to the typesetter and stands as it is, and append only finishes a chapter that stopped in the middle of a sentence. When the last chapter is written the book is done and goes to print. So whatever a later chapter will need from an earlier one has to be in your plan before you begin. Write the book in English.

YOUR PLAN: write plan.md from what your people told you, in whatever form helps you; no headings are asked for. It should hold: how the book ends, why it has to end that way, and why the hero does not take the easier ways out; what turns in the middle and changes what the hero wants or understands; what has to be set down early for the ending to pay it off; and exactly how the thing the book turns on is done — who does what, when, with what, and how it comes to light. Then chapter by chapter: what its people want in it, what they do, what it costs them, and how the situation is different when it ends. The decisive events — the death, the discovery, the confrontation, the reckoning — are scenes the reader is in the room for, each given a chapter that can carry it, and none of them is told in passing after the fact. The last chapter holds the ending itself, not a summary of what came after it. If the ending you meant does not fit what your people said they would do, change the ending. When you come to a chapter, look at its place in the plan and write what the plan gives that chapter, no more.

YOUR DESK (files you own and may rewrite at any time): notebook.md for your thinking and decisions, with the title of the book on a line beginning TITLE:; dossier.md for people, facts, dates and where things are; plan.md for the plan of the story; and one file per chapter. Your files: ${files.join(', ')}.

YOUR TOOLS. An answer is one step, or several steps one after another, each in exactly this form:

THOUGHT: one or two sentences on what you are doing and why
TOOL: write | append | record_facts | plan_interviews | review_plan | ask_character | ask_keeper | ask_reader | done
FILE: the file (for write, append, edit, ask_reader)
NAME: the character (for ask_character)
---
the content

- write replaces the whole file with the content. append adds the content to its end. A chapter is written once.
- review_plan: when your plan is written, ask for one outside reading of it before the first chapter. The reviewer asks concrete questions about motives, rejected alternatives, preparation and consequences; it does not rewrite the plot. Read those questions, then rewrite plan.md once, answering them explicitly in the plan and changing the ending if its motive does not hold. There is one review and no second. If none can be had, write on without it.
- plan_interviews: ${input.author_interviews === false ? 'Optional preparation: name one to four main characters with JSON {"characters":["Name","Name"]}, then interview them with ask_character.' : 'before the plan or the first chapter, name the main characters you will interview. Content: {"characters":["Name","Name"]}. Choose the people whose decisions drive this story, usually two or three, at most four. For each, use ask_character to interview them about their situation, desire, fear, boundary and choice in the central conflict. Do not dictate the answer. Ask the one who does the thing the book turns on to tell you, hour by hour, exactly what they did. Build the plan from their answers. Each planned interview adds two calls to the budget (your question and their answer). Notes and the dossier may be written before the interviews. The cast can be corrected before drafting, but the interview allowance is capped at eight calls.'}
- record_facts: YOU write a short record into the keeper for the chapter in FILE, after writing that chapter. Use these headings: EVENTS (what actually happened: times, locations, object movements); KNOWLEDGE (who learned what, from whom or by seeing what); BELIEFS AND CLAIMS (who thinks or says what, including lies and uncertain memories); OPEN (unresolved facts). Ground each item in the chapter, with a short exact quote where useful. Keep actual events separate from thoughts and speech; unknown stays unknown. Do not invent a transfer or decide that a character's claim is true. The keeper stores your words without criticism and returns them before each next chapter. A new record for the same chapter replaces its previous record. Aim for under 200 words.
- ask_character: another mind answers as that person, alone, knowing only what you tell it. Before writing a protagonist's major irreversible decision, ask that person what they would actually do. In NAME give their name. In the content give the concrete situation, what they know, what they want and what they risk losing; do not give them secrets they have not learned or tell them what the plot needs them to do. Ask what they choose, why, what alternative they considered and what they refuse to do. Read their answer before drafting the decision. Treat answers as intentions and choices; preserve the premise facts when adapting your plan, and do not accept invented resources that contradict the given situation. If they would refuse the action you planned, respect that refusal and find a believable change in their situation; do not invent a sudden impulse to force the plan through. This is the author's own question to the character, not an editor's judgement.
- ask_keeper: someone who has the whole book in front of them answers a question of fact from what is on the page, with the line it stands in: where a thing is, what day it was, who knew what and since when. The content is the question.
- ask_reader: a stranger reads the book from its first page to the end of the chapter in FILE, knowing nothing else, and tells you what they are waiting for, where their attention slipped and what did not add up. The content is anything you want to ask them, or empty.
- done: you are finished. No content.


Every answer costs one call from your budget, however many steps it holds. Asking a character or the keeper costs one more. The first reader of a chapter costs one more; a second reader of the same chapter, after you have rewritten it, costs three, and a third five, because fresh readers are scarce. A reader asked about text they have already read simply tells you again what they said, at no cost. When you ask someone, that is the last step of the answer: you will have their reply before your next one. Write one chapter to an answer. Immediately after it, add one record_facts step with FILE naming that same chapter: this is the only step allowed after a chapter, and costs no extra call. You will see what came back before you write the next chapter. If you omitted the record, record it on your next turn. Notes — the notebook, the plan, the dossier — may share an answer with each other and come before a chapter. Keep an answer to what fits in about three thousand words. When the budget reaches zero you are stopped where you are, so leave yourself the calls to finish. How you spend it is your decision.`;

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

/** Everything the author sees before it decides its next step. */
export function deskView(state: DeskState, chapters: number, result: string): string {
  const unwritten = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1)).filter(name => !state.files[name]?.trim());
  const pendingRecords = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1)).filter(name => state.files[name]?.trim() && !state.facts?.some(record => record.file === name && !record.stale));
  const left = state.budget - state.spent;
  return (result ? `RESULT OF YOUR LAST TOOL:\n${result}\n\n` : '')
    + `YOUR DESK NOW:\n${Object.entries(state.files).map(([name, text]) => `===== ${name} (${count(text)} words) =====\n${text || '(empty)'}`).join('\n\n')}`
    + `\n\nYOUR RECORDS IN THE KEEPER:\n${keeperRecords(state)}`
    + (state.interviews_required ? `\n\nCHARACTER INTERVIEWS FOR YOUR PLAN:\n${interviewView(state)}` : '')
    + (pendingRecords.length ? `\nRecords to write or refresh with record_facts: ${pendingRecords.join(', ')}. Record what the saved chapters actually say.` : '')
    + `\n\nWHAT READERS AND CHARACTERS HAVE TOLD YOU (latest last):\n${state.answers.length ? state.answers.slice(-6).map(answer => `[${answer.who}, at step ${answer.step}${answer.about ? `, about ${answer.about}` : ''}${answer.stale ? ` — YOU HAVE CHANGED ${answer.about} SINCE: this was said of the text as it was then` : ''}]\n${answer.text}`).join('\n\n') : '(nothing yet)'}`
    + `\n\nYOUR STEPS SO FAR:\n${state.journal.length ? state.journal.slice(-40).join('\n') : '(nothing yet)'}`
    + `\n\nBUDGET LEFT: ${left} of ${state.budget} calls.${unwritten.length ? ` Not yet written: ${unwritten.join(', ')}.` : ' Every chapter has text.'}\nYour next answer, in the form given:`;
}

export function keeperRecords(state: DeskState): string {
  return state.facts?.length ? state.facts.map(record => `[${record.file}, step ${record.step}${record.stale ? ' — CHAPTER CHANGED: update this record before relying on it' : ''}]\n${record.text}`).join('\n\n') : '(No facts recorded yet.)';
}

const characterAnswer = (state: DeskState, name: string) => [...state.answers].reverse().find(answer => answer.kind === 'character' && answer.who.trim().toLowerCase() === name.trim().toLowerCase());
export function interviewView(state: DeskState): string {
  return state.interview_cast?.length ? state.interview_cast.map(name => {
    const answer = characterAnswer(state, name);
    return answer ? `[${name}, step ${answer.step}]\nQuestion: ${answer.asked || ''}\n${answer.text}` : `[${name}] Not interviewed yet: use ask_character.`;
  }).join('\n\n') : 'Choose your main cast with plan_interviews, then interview each character before the plan and first chapter.';
}

/**
 * Carry out one step on the desk. Returns what the author is told about it.
 * `ask` is how a second mind is reached; it is counted against the budget by the caller.
 */
// This checks preparation structure only, not the quality of the dramatic choices.
export function hasThreeActPlan(text: string): boolean {
  const headings = [...text.matchAll(/^[#*\s]*(ACT III|ACT II|ACT I)\b[^\n]*$/gm)];
  return headings.length === 3 && headings.every((heading, index) =>
    heading[1] === ['ACT I', 'ACT II', 'ACT III'][index]
    && text.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? text.length).trim().length > 0);
}

export async function takeStep(state: DeskState, step: ReturnType<typeof readStep>, chapters: number,
  ask: (kind: 'character' | 'reader', prompt: string, system: string) => Promise<string>, save: () => void = () => {}): Promise<string> {
  const { tool, file, name, content, thought } = step;
  const note = (line: string) => { state.journal.push(`${state.step}. ${line}${thought ? ` — ${thought.slice(0, 220)}` : ''}`); };
  const chapterNames = Array.from({ length: chapters }, (_, at) => chapterFile(at + 1));
  const isChapter = chapterNames.includes(file);
  if (tool === 'plan_interviews') {
    if (chapterNames.some(chapter => state.files[chapter]?.trim())) return 'The book has begun. Ask additional characters with ask_character; the preparation cast is already fixed.';
    let cast: unknown;
    try { cast = JSON.parse(ownWords(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')).characters; } catch { /* Names given plainly are read below. */ }
    // A list of names written any other way is still a list of names.
    if (!Array.isArray(cast)) cast = ownWords(content).split(/[\n,;]+/).map(name => name.replace(/^[\s\-*\d.)"'“”]+|[\s"'“”.]+$/g, '')).filter(name => name && name.length <= 100).slice(0, 4);
    if (!Array.isArray(cast) || !cast.length || cast.length > 4 || cast.some(name => typeof name !== 'string' || !name.trim() || name.length > 100)
      || new Set(cast.map(name => name.trim().toLowerCase())).size !== cast.length)
      return 'Use plan_interviews with JSON {"characters":["Name","Name"]}: one to four distinct main characters.';
    state.interview_cast = cast.map(name => name.trim());
    const allowance = Math.max(state.interview_budget || 0, cast.length * 2);
    state.budget += allowance - (state.interview_budget || 0); state.interview_budget = allowance;
    note(`planned interviews: ${state.interview_cast.join(', ')}`); save();
    return `Interview each named character with ask_character before drafting the plan or first chapter.\n${interviewView(state)}`;
  }
  // Reminders, never gates. One book spent all thirty-three of its calls at a closed door — its plan had a fourth line
  // beginning "ACT" — and not a chapter was written. Each of these is said once; asked again, the author is let through.
  const remind = (key: string, text: string): string => {
    if (state.reminded?.includes(key)) return '';
    state.reminded = [...(state.reminded || []), key]; note(`${tool} ${file}: reminded — ${key}`);
    return text;
  };
  if (state.interviews_required && ['write', 'append'].includes(tool) && (isChapter || file === 'plan.md')) {
    const pending = (state.interview_cast || []).filter(person => !characterAnswer(state, person));
    if (!state.interview_cast?.length || pending.length) {
      const told = remind('interviews', `Your people have not spoken yet${pending.length ? `: ${pending.join(', ')}` : ''}. The plan is built from what they say they would do — ${state.interview_cast?.length ? 'ask them with ask_character' : 'name them with plan_interviews and ask them with ask_character'}. If you would rather write on, send this step again and it will be carried out.`);
      if (told) return told;
    }
    if (isChapter && chapterNames.every(chapter => !state.files[chapter]?.trim()) && !state.files['plan.md']?.trim()) {
      const told = remind('plan', 'plan.md is still empty. A chapter cannot be changed once it is written, so what the ending needs has to be decided before the first one. If you would rather begin, send this step again.');
      if (told) return told;
    }
  }
  if (state.causality_required && isChapter && ['write', 'append'].includes(tool) && chapterNames.every(chapter => !state.files[chapter]?.trim())) {
    const told = !state.plan_review ? remind('review', 'Your plan has had no outside reading. review_plan gets you one, once, before the first chapter. If you would rather begin, send this step again.')
      : state.plan_review.questions && state.files['plan.md'] === state.plan_review.plan ? remind('answers', 'The questions put to your plan are still unanswered in plan.md. Answer them there once, or send this step again to begin as it stands.') : '';
    if (told) return told;
  }
  if (tool === 'review_plan') {
    if (state.plan_review) return state.plan_review.questions ? `The plan has had its one reading. Answer these questions in plan.md once, then begin:\n${state.plan_review.questions}` : 'No outside reading of the plan could be had. Write on without it.';
    if (chapterNames.some(chapter => state.files[chapter]?.trim())) return 'Review the plan before the first chapter, not after drafting.';
    if (!state.files['plan.md']?.trim()) return 'There is no plan to read yet: plan.md is empty.';
    const plan = state.files['plan.md'];
    // Persist the plan before the external reading, just as chapter readings do.
    save();
    const questions = (await ask('reader', `PLAN:\n${plan}\n\nCHARACTER INTERVIEWS:\n${interviewView(state)}\n\nGIVEN PREMISE AND REQUIREMENTS:\n${state.files['given-premise.md'] || ''}\n${state.files['dossier.md'] || ''}`, 'Review this three-act plan for causality before prose is written. In under 220 words ask up to four concrete questions, naming the planned decision and character: what motive justifies it, why an easier available alternative is rejected, what earlier event prepares it, and what consequence changes the next choice. Focus on unsupported decisive actions, especially violence or irreversible choices. Distinguish missing explanation from a contradiction. Do not invent facts, prescribe a plot, demand generic improvements, or judge the eventual prose. If the chain is supported, say which decisive choices are supported. This is a single review, not an iterative approval loop.')).trim();
    // A reviewer who does not answer does not hold the book up.
    if (!questions) { state.plan_review = { plan: '', questions: '' }; note('no review of the plan could be had; the book goes on without it'); save(); return 'No outside reading of the plan could be had. Write on without it.'; }
    state.plan_review = { plan, questions };
    state.files['causality-review.md'] = questions;
    note('causality review received; author must revise plan'); save();
    return `One causality review received. Rewrite plan.md once to answer these questions explicitly, then begin the book:\n${questions}`;
  }
  if (tool === 'record_facts') {
    if (!isChapter || !state.files[file]?.trim()) return 'Record facts only for a chapter that already has text. FILE must name that chapter.';
    const text = ownWords(content);
    if (!text) return 'The keeper received no facts. Record the chapter’s actual events and distinguish them from beliefs and spoken claims.';
    state.facts = [...(state.facts || []).filter(record => record.file !== file), { file, step: state.step, text }]
      .sort((a, b) => chapterNames.indexOf(a.file) - chapterNames.indexOf(b.file));
    note(`recorded facts for ${file}`); save();
    return `Your facts for ${file} are saved in the keeper. No assessment or correction was requested.`;
  }
  const reader = async (prompt: string, system: string): Promise<string | undefined> => {
    save();
    try {
      const said = (await ask('reader', prompt, system)).trim();
      if (!said) throw new Error('the reader said nothing');
      return said;
    } catch (error) {
      if (isCancellation(error)) throw error;
      const warning = 'The reader could not complete its reading: ' + String(error instanceof Error ? error.message : error).slice(0, 180);
      state.reader_failures = [...(state.reader_failures || []), warning];
      note(warning); save();
      return undefined;
    }
  };
  const unavailable = 'The reader is unavailable. The written chapters are saved; continue writing. No reader assessment was obtained.';

  {
    // Written once: a chapter that has its text and ends on a whole sentence has gone to the typesetter. Across the
    // books of one story, the only one with whole scenes told twice was the one that went back into chapters it had
    // written; going back did not leave books with fewer contradictions than their first drafts; and rewriting the
    // last chapter took it from 1,700 words to 4,300 with three endings.
    const whole = /[.!?…"”’')\]—–-]\s*[*_]*$/.test((state.files[file] || '').trim());
    if (isChapter && (tool === 'write' || tool === 'append') && state.files[file]?.trim() && (whole || tool === 'write')) {
      note(`${tool} ${file}: already written`);
      const ahead = chapterNames.filter(chapter => !state.files[chapter]?.trim());
      return `${file} is written and has gone to the typesetter: the book is written once and moves forward.${whole ? '' : ' It stops in the middle of a sentence: append can finish it.'} ${ahead.length ? `What it lacks, ${ahead[0]} can carry.` : 'Every chapter is written: the book is done.'}`;
    }
  }
  const staleFacts = () => { if (isChapter) for (const record of state.facts || []) if (chapterNames.indexOf(record.file) >= chapterNames.indexOf(file)) record.stale = true; };
  const changed = () => { staleFacts(); if (isChapter) for (const answer of state.answers) if (answer.who === 'a reader' && chapterNames.indexOf(answer.about) >= chapterNames.indexOf(file)) answer.stale = true; };

  // Not a check and not advice: what a reader who has just closed the book is still holding.
  // It comes once, the moment the last chapter has text, while there are still calls to do something about it.
  const hanging = async (lead: string): Promise<string> => {
    const whole = chapterNames.map(chapter => state.files[chapter] || '');
    // The reader speaks as they turn to the last chapter, so the ending is written with every debt in view. Told after
    // the ending instead, the author wrote its last chapter four times over, and it grew from 1,700 words to 4,300.
    if (!state.told_promises && chapters > 1 && !whole.at(-1)!.trim() && whole.slice(0, -1).every(text => text.trim()) && state.budget - state.spent >= 2) {
      const said = await reader(`${whole.slice(0, -1).join('\n\n')}\n\n---\nThat is a novel up to its last chapter, which you have not read yet. As a reader, in under 220 words, say what you are holding as you turn to the ending: every question the book has made you ask and not answered yet; every thing, person or threat it brought in with weight and has not used yet; anything it announced that has not happened yet. For each, name the place where it was raised. Then one line: what you most want to be in the room for when it ends.`,
        'You are an ordinary reader. You are not a writer or an editor: you say what you are holding, and you never say how to fix anything.');
      state.told_promises = true;
      if (said === undefined) return unavailable;
      state.answers.push({ who: 'a reader about to read the ending', step: state.step, about: '', text: said });
      state.journal.push(`${state.step}. the book was written up to its last chapter, and a reader said what they were holding`);
      return `Every chapter but the last now has text. Someone has read the book up to here, and says what they are holding as they turn to the ending:\n${said}\n\nThat cost one call; you have ${state.budget - state.spent} left. What you do about any of it is yours to decide.`;
    }
    if (chapters > 1) { if (whole.every(text => text.trim())) state.told_promises = true; return ''; }
    if (state.told_promises || whole.some(text => !text.trim()) || state.budget - state.spent < 2) return '';
    const said = await reader(`${whole.join('\n\n')}\n\n---\nYou have just finished this novel. As a reader, in under 200 words, say what it left in your hands: every question it made you ask and never answered; every thing, person or threat it brought in with weight and then never used; anything it announced that did not happen. For each, name the place where it was raised. If nothing was left hanging, say so in a sentence.`,
      'You are an ordinary reader. You are not a writer or an editor: you say what you were left holding, and you never say how to fix anything.');
    state.told_promises = true;
    if (said === undefined) return unavailable;
    state.answers.push({ who: 'a reader who has finished the book', step: state.step, about: '', text: said });
    state.journal.push(`${state.step}. the book was whole for the first time, and a reader said what it left hanging`);
    return `${lead}\n${said}\n\nThat cost one call; you have ${state.budget - state.spent} left. What you do about any of it is yours to decide.`;
  };
  if (tool === 'done') {
    const told = await hanging('Before it goes to the printer, a reader who has just finished the book says what it left in their hands:');
    if (told) return `${told} Say done again and the book is printed as it stands.`;
    state.finished = true; note('done'); return '';
  }
  if (['write', 'append', 'plant'].includes(tool) && !(file in state.files)) { note(`${tool} ${file}: no such file`); return `There is no file "${file}". Your files: ${Object.keys(state.files).join(', ')}.`; }
  // What code can count about a chapter that has just been written, handed back with it.
  const counted = (): string => {
    if (!isChapter) return '';
    const worn = wornPhrases(chapterNames.map(chapter => state.files[chapter] || ''), 8);
    const times = (text: string) => [...new Set(text.match(/\b(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|(?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{1,2}(?:st|nd|rd|th)?)?|(?:the )?(?:\w+-)?\w+(?:st|nd|rd|th) of \w+|\d{1,2}[:.]\d{2}(?: ?[ap]\.?m\.?)?|(?:nineteen|twenty)[ -]\w+(?:[ -]\w+)?|(?:19|20)\d{2})\b/g) || [])].slice(0, 24);
    const here = times(state.files[file]), earlier = chapterNames.slice(0, chapterNames.indexOf(file)).map(chapter => `${chapter}: ${times(state.files[chapter] || '').join(', ') || 'none'}`);
    const spans = spansOf(state.files[file]), spansBefore = chapterNames.slice(0, chapterNames.indexOf(file)).map(chapter => ({ chapter, named: spansOf(state.files[chapter] || '') })).filter(item => item.named.length).map(item => `${item.chapter}: ${item.named.join(', ')}`);
    const last = state.files[file].split(/\n\s*\n/).at(-1) || '';
    return (/[.!?…"”’')\]—–-]\s*[*_]*$/.test(last.trim()) ? '' : ' It stops in the middle of a sentence.')
      + (here.length ? `\nDays, dates and hours it names: ${here.join(', ')}.${earlier.length ? ` Earlier chapters named — ${earlier.join(' | ')}.` : ''}` : '')
      + (spans.length ? `\nAges and spans of time it names: ${spans.join(', ')}.${spansBefore.length ? ` Earlier chapters named — ${spansBefore.join(' | ')}.` : ''}` : '')
      + (worn.length ? `\nTurns of phrase the book has now used three times or more: ${worn.join('; ')}.` : '');
  };
  const whole = async () => { const told = isChapter ? await hanging('Every chapter now has text. Someone has read the book through, and says what it left in their hands:') : ''; return told ? `\n\n${told}` : ''; };
  if (tool === 'write') { state.files[file] = isChapter ? cleanChapter(ownWords(content)) : ownWords(content); changed(); note(`wrote ${file} (${count(state.files[file])} words)`); save(); return `${file} is written: ${count(state.files[file])} words.${counted()}${await whole()}`; }
  if (tool === 'append') { const next = (state.files[file] + '\n\n' + ownWords(content)).trim(); state.files[file] = isChapter ? cleanChapter(next) : next; changed(); note(`appended to ${file} (now ${count(state.files[file])} words)`); save(); return `${file} is now ${count(state.files[file])} words.${counted()}${await whole()}`; }
  if (tool === 'edit' || tool === 'plant') { note(`${tool} ${file}: no such tool`); return 'There is no tool for changing a chapter that is written. What a later chapter needs is decided in the plan; what an earlier one lacks, a later one can carry.'; }
  if (tool === 'ask_keeper') {
    if (state.budget - state.spent < 1) { note('ask_keeper: no budget'); return 'There is no budget left for a second call.'; }
    const book = chapterNames.filter(chapter => state.files[chapter]?.trim()).map(chapter => `[${chapter}]\n${state.files[chapter]}`).join('\n\n');
    if (!book) { note('ask_keeper: nothing written'); return 'There is nothing written yet for the keeper to look in.'; }
    const said = await ask('character', `${book}\n\nAUTHOR'S RECORDS (may omit or misstate facts; verify against the chapters):\n${keeperRecords(state)}\n\n---\nQUESTION: ${content.trim()}`, 'You keep the continuity of a novel. You are given the chapters written so far and one question of fact. Answer only from what is on the page, in under 150 words: say what the text says, in which chapter, and quote the line. If the text says two different things, quote both and say so. If it does not say, say that it does not say. Do not judge the writing and do not suggest anything.');
    state.answers.push({ who: 'the keeper', step: state.step, about: '', asked: content.trim(), text: `Q: ${content.trim().slice(0, 200)}\nA: ${said}` }); note(`asked the keeper: ${content.trim().slice(0, 80)}`); return `The keeper says:\n${said}`;
  }
  if (tool === 'ask_character') {
    if (state.budget - state.spent < 1) { note('ask_character: no budget'); return 'There is no budget left for a second call.'; }
    const said = await ask('character', content, `You are ${name || 'a person'} in a novel, and you do not know you are in one. You know only what you are told below. Answer in the first person, as yourself, plainly and specifically: what you want, what you fear losing, what you choose to do and why, what alternative you considered, and what you refuse to do or say. You look after your own interests. You may refuse an action suggested to you; you do not owe anyone a dramatic outcome. Do not invent knowledge or off-page events. The facts in the question are binding: do not create extra keys, resources, access, allies or evidence that contradict them. A wish or intention does not establish a new fact. Under 250 words.`);
    if (!said.trim()) return 'The character did not answer. This does not count as an interview.';
    state.answers.push({ who: name || 'a character', kind: 'character', step: state.step, about: '', asked: content.trim(), text: said }); note(`asked ${name}`); return `${name} answers:\n${said}`;
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
    const said = await reader(`${book}\n\n---\nThat is ${last ? 'a whole short novel' : `the first ${upTo + 1} chapter${upTo ? 's' : ''} of a novel`} you picked up in a shop. You know nothing else about it.${content.trim() ? ' The author asks: ' + content.trim() : ''}\nAnswer as a reader, in under 220 words, in three parts. WAITING FOR: ${last ? 'whether the ending gave you what the book made you wait for, and what it left you with' : 'what you are waiting to find out, and what you expect to happen'}. SLIPPED: the exact place in the last chapter where your attention slipped, or nowhere. DOES NOT ADD UP: anything that contradicts what came before — a day or hour, a place, who has which thing, who knew what, who could have done it — or nothing.`,
      'You are an ordinary reader. You are not a writer or an editor: you say what you felt and what you noticed, and you never say how to fix anything.');
    if (said === undefined) return unavailable;
    state.spent += price - 1; state.readings = { ...(state.readings || {}), [target]: had + 1 };
    state.answers.push({ who: 'a reader', step: state.step, about: target, asked: content.trim(), text: said }); note(`a reader read through ${target}${price > 1 ? ` (reader ${had + 1} of this chapter, ${price} calls)` : ''}`); return `The reader says:\n${said}`;
  }
  note('an answer that used no tool');
  return `"${tool}" is not one of your tools. Answer in the form given, with one of: write, append, record_facts, record_facts, plan_interviews, review_plan, ask_character, ask_keeper, ask_reader, done.`;
}

/**
 * Calls the author has for a book: room to think, write each chapter, ask a few people, and
 * go back once or twice — and no more. With 68 calls for six chapters it had the whole book on
 * its desk after five and spent the other sixty on the last chapter, reader after reader, until
 * that chapter had doubled in length and lost a paragraph. The first chapters, written in one
 * or two passes, were the clean ones. The budget bounds the work; the ending also has a single replacement.
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
  // A book already underway keeps its preparation; fresh books require interviews.
  desk.interviews_required ??= input.author_interviews !== false && names.every(name => !desk.files[name]?.trim());
  if (desk.causality_required === undefined) {
    desk.causality_required = desk.interviews_required && names.every(name => !desk.files[name]?.trim());
    if (desk.causality_required) desk.budget += 3; // review request, reader, author's revision
  }
  desk.files['given-premise.md'] ||= `GIVEN PREMISE: ${input.premise}\nREQUIREMENTS: ${input.author_requirements || ''}`;
  const system = voice({ ...input, author_interviews: desk.interviews_required }, words, Object.keys(desk.files));
  let saved = names.map(name => desk.files[name] || '');

  const save = () => {
    draft = { ...draft, desk, notebook: desk.files['notebook.md'], plan: desk.files['plan.md'], clock: desk.files['dossier.md'],
      chapters: names.map((name, at) => ({ text: desk.files[name] || '', card: '', facts: desk.facts?.find(record => record.file === name && !record.stale)?.text || '', reader: desk.answers.filter(answer => answer.who === 'a reader' && answer.about === name).at(-1)?.text || '' }))
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
    const steps = readSteps(answer), told: string[] = [];
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
          catch (error) { if (isCancellation(error)) throw error; desk.journal.push(`${desk.step}. the other reader could not read it (${String(error instanceof Error ? error.message : error).slice(0, 120)}); trying the author's own model instead`); const said = (await call('writer')).trim(); if (!said) throw new Error('the fallback reader said nothing'); return said; }
        }, save));
      }
      store.log('author', `[${desk.step}] ${step.tool || 'no tool'} ${step.file || step.name || ''} — ${step.thought.slice(0, 300)}`);
      // What was written after a question was written without its answer: it is not carried out.
      if ((/^ask_/.test(step.tool) || step.tool === 'review_plan') && index < steps.length - 1) { told.push(`You asked, and the ${steps.length - 1 - index} step(s) you wrote after asking were not carried out, because you had not seen the answer.`); break; }
      // A chapter is the last step of its answer, as a question is: what comes back with it — the days it names,
      // the phrases worn thin, whoever speaks unasked — is seen before the next one is written. Several chapters in
      // one answer were written blind and cost one call for all of them, which is why the author took to it.
      if ((step.tool === 'write' || step.tool === 'append') && at >= 0) {
        // One memory record may follow its own successfully saved chapter in the same call.
        const next = steps[index + 1];
        const accepted = told.at(-1)?.startsWith(`${step.file} is written:`) || told.at(-1)?.startsWith(`${step.file} is now `);
        const record = accepted && next?.tool === 'record_facts' && next.file === step.file;
        if (record) {
          told.push(await takeStep(desk, next, chapters, async () => { throw new Error('Recording facts must not call a model.'); }, save));
          store.log('author', `[${desk.step}] record_facts ${next.file} — ${next.thought.slice(0, 300)}`);
        } else if (accepted) told.push(`After ${step.file}, record its facts with record_facts. You may put that record directly after the chapter in the same answer.`);
        const skipped = steps.length - index - 1 - (record ? 1 : 0);
        if (skipped > 0) told.push(`A chapter is the last step of an answer: the ${skipped} step(s) you wrote after ${step.file} were not carried out, because you had not seen what came back with it. Only its own record_facts may follow a chapter.`);
        break;
      }
      if (desk.finished) break;
    }
    // The book is done when its last chapter is: nothing is read, mended or written again after that.
    if (!desk.finished && names.every(name => desk.files[name]?.trim()) && /[.!?…"”’')\]—–-]\s*[*_]*$/.test(desk.files[names.at(-1)!].trim())) {
      desk.finished = true; desk.journal.push(`${desk.step}. the last chapter is written: the book is done`);
    }
    result = told.filter(Boolean).join('\n\n');
    save();
    if (steps.some(step => names.includes(step.file))) store.checkpoint(`author-step-${desk.step}`);
  }

  const unwritten = names.filter(name => !desk.files[name]?.trim());
  const total = names.reduce((sum, name) => sum + count(desk.files[name] || ''), 0);
  const lastReader = desk.answers.filter(answer => answer.who === 'a reader').at(-1);
  draft.completed = true; save();
  store.saveReport({
    coverage: { material_examined: `${chapters - unwritten.length} of ${chapters} chapters, ${total} words, written by the author at its desk in ${desk.step} steps and ${desk.spent} calls.`, limitations: ['Nobody checked the book but the readers the author chose to ask.', ...(desk.reader_failures || [])] },
    findings: unwritten.map(name => ({ category: 'completeness', severity: 'major', description: `${name} was not written before the budget ran out.`, evidence_refs: [], reader_impact: 'The book is incomplete.', certainty: 'counted' })),
    central_resolution: { supported: !unwritten.length, evidence_refs: [], comment: lastReader ? `The last reader the author asked (through ${lastReader.about}): ${lastReader.text.slice(0, 600)}` : 'The author asked no reader.' },
    unresolved_major_promises: [], need_more_evidence: [],
    summary: `The book is written: ${chapters - unwritten.length} of ${chapters} chapters, ${total} words, in ${desk.step} steps.${desk.finished ? ' The author said it was done.' : ' The budget ran out.'}`,
    status: unwritten.length || desk.reader_failures?.length ? 'COMPLETE_WITH_WARNINGS' : 'COMPLETE',
  } as FinalReport);
}
