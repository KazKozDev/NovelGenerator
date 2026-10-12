/**
 * An experiment, not yet the product: the model is the author. It is given a desk (files it
 * owns), a few tools, the premise and a budget of calls, and no procedure. What it leaves on
 * the desk is the book.
 *
 * Three things are fixed, each learned from a run:
 * - the clock comes first: who does the central deed and where everyone is, hour by hour.
 *   A four-chapter book was written with an unbreakable alibi and nobody who did the killing.
 * - a chapter is read by one reader once and revised once, then closed. The one chapter that
 *   was rewritten five times was the one that contradicted itself.
 * - what a reader said about a chapter leaves the desk when that chapter changes. A stale
 *   complaint kept the author repairing a fault that was no longer there for 27 calls.
 *
 * And three from the eight-chapter run, all in the tools:
 * - a chapter is edited by paragraph number. Quoting a passage word for word failed ten times
 *   and twice left a hole: a lost line, a chapter ending mid-sentence.
 * - closing a chapter puts its facts in the dossier. Left free, the author kept no dossier,
 *   and a March became a September and a Mrs. a Dr.
 * - when a reader says something does not add up, it is settled in clock.md before the chapter
 *   is revised, and it has to agree with the chapters already closed. Each revision used to
 *   answer the reader by changing the story of the scarf, one chapter at a time.
 *
 * And from the second eight-chapter run:
 * - a chapter is revised by writing it again whole, once. Written in one pass a chapter came
 *   out clean; every duplicate, every paragraph out of order and every hole came from
 *   patching a finished chapter, by quotation or by paragraph number alike.
 * - the clock holds facts by the hour and nothing else, and names before chapter one what
 *   the truth comes out by and where the reader first sees it. It had grown from 900 words to
 *   4,800 of after-the-fact explanation, and the proof that ends the book was invented in the
 *   last chapter to answer a reader.
 * - the author's own reasons are kept for it as a journal. It wrote two lines of reasoning at
 *   every step and could see only fragments of the last few.
 *
 *   npx vite-node scripts/author-experiment.ts --chapters 8 --words 2000 --budget 90 --premise "..." --out runs/author-8
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateOllamaText } from '../services/ollamaService';

const arg = (name: string, fallback: string) => { const at = process.argv.indexOf(`--${name}`); return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback; };
const model = arg('model', 'deepseek-v4.1-flash:cloud'), helper = arg('helper', model), endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const out = arg('out', 'runs/author-test'), premise = arg('premise', ''), words = Number(arg('words', '2000')), chapters = Number(arg('chapters', '4'));
const settings = arg('settings', '');
let budget = Number(arg('budget', String(chapters * 11)));
const total = budget;
if (!premise) throw new Error('--premise is required');
mkdirSync(out, { recursive: true });
const log = (line: string) => { console.log(line); appendFileSync(join(out, 'log.txt'), line + '\n'); };
const count = (text: string) => text.split(/\s+/).filter(Boolean).length;

const chapterFiles = Array.from({ length: chapters }, (_, at) => `chapter-${at + 1}.md`);
const notes = ['notebook.md', 'dossier.md', 'clock.md', 'plan.md'];
const desk: Record<string, string> = Object.fromEntries([...notes, ...chapterFiles].map(name => [name, '']));
type State = 'empty' | 'drafted' | 'revised' | 'closed';
const state: Record<string, State> = Object.fromEntries(chapterFiles.map(name => [name, 'empty' as State]));
const readBy: Record<string, boolean> = {}, plants: Record<string, number> = {}, cards: Record<string, string> = {}, owesClock: Record<string, boolean> = {};
const paragraphs = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
const numbered = (text: string) => paragraphs(text).map((part, at) => `[${at + 1}] ${part}`).join('\n\n');
/** A chapter file holds the chapter. The author's card, its facts and repeated paragraphs are taken out by code. */
const cleanChapter = (text: string) => {
  const cut = text.search(/\n[ \t]*(#{1,4}[ \t]*\**CARD\b|\**What happened:)/i);
  const seen = new Set<string>();
  return paragraphs(cut > 0 ? text.slice(0, cut) : text).map(part => part.replace(/^\[\d+\]\s*/, '')).filter(part => !/^[-=*_]{3,}$/.test(part) || true)
    .filter(part => { if (part.length < 80) return true; if (seen.has(part)) return false; seen.add(part); return true; }).join('\n\n').replace(/(\n\n[-=*_]{3,})+\s*$/, '');
};
const comesOut = (text: string) => text.split('\n').find(line => /^\W*HOW IT COMES OUT:/i.test(line))?.trim() || '';
let fixedComesOut = '';
// Once a chapter exists, the clock is rewritten only to answer a reader, once per answer. Left
// free, the author rewrote it ten times running for one objection, each time "about to" settle it.
let clockTurns = 0;
const journal: string[] = [];
const unnumbered = (text: string) => paragraphs(text).map(part => part.replace(/^\[\d+\]\s*/, '')).join('\n\n');
let answers: { about: string; text: string }[] = [];
const done: string[] = [];

const ask = async (prompt: string, system: string, temperature: number, maxTokens: number, which = model): Promise<string> => {
  budget--;
  for (let attempt = 1; ; attempt++) {
    try { const text = (await generateOllamaText(prompt, system, undefined, temperature, which, endpoint, maxTokens)).trim(); if (text) return text; throw new Error('empty answer'); }
    catch (error) { if (attempt >= 3) throw error; log(`   (the model did not answer: ${error instanceof Error ? error.message.slice(0, 120) : error}; trying again)`); await new Promise(resolve => setTimeout(resolve, 5000 * attempt)); }
  }
};

const AUTHOR = `You are the author of a commercial thriller that is meant to sell: a book a stranger opens in a shop and cannot put back. It is your book. Nobody will tell you how to write it and nobody will correct it: what is on your desk when your budget runs out is what gets printed.

THE PREMISE YOU WERE GIVEN:
${premise}
${settings ? `\nWHAT THE PUBLISHER PUT ON THE FORM (keep to it unless you have a strong reason not to, and say the reason in your notebook):\n${settings}\n` : ''}
YOUR JOB: the whole story, complete, in ${chapters} chapters of about ${words} words each. It begins, turns, gets worse and ends inside these chapters: the last page of the last chapter is the end of the book. Intimate scenes are written on the page, adult and direct, not faded out. Write the book in English.

YOUR DESK. Notes you own and may rewrite at any time: notebook.md (your reasons, doubts and decisions — anything that begins "because"), dossier.md (people, facts, dates, where things are; the facts of each chapter are added to it for you when you close it), clock.md, plan.md (the story in whatever form helps you; keep it true to the book as it turns out). Your own note at each step is kept for you as a journal. The book: ${chapterFiles[0]} to ${chapterFiles.at(-1)}. You always see your notes, the chapter you are on and the one before it in full; earlier chapters you see as the cards you wrote when you closed them.

HOW THE DESK WORKS. There are four fixed things, and everything else is yours to decide.
1. clock.md comes before any chapter, and it is short: facts by the day and hour, no reasons and no argument (those go in notebook.md). In it: who does the worst thing in this story, with whose hands, where and at what hour; where every other person is at that hour and who could swear to it. And one line beginning HOW IT COMES OUT: naming the one thing the truth finally comes out by — an object, a record, a person who saw — and the chapter in which the reader first sees it, which must be well before the end (write it as "chapter N"). An ending that rests on something the reader was never shown is a cheat. Once half the book is closed that line cannot change. Every time and place in the clock must agree with every other. If you cannot say who did it and how it comes out, you do not have a story yet.
2. Chapters are written in order. When a chapter is drafted you may have one reader read it once, and you may revise it once — by writing the whole chapter again with write, never by patching it. Then you close it with a card and its facts. You cannot rewrite a closed chapter, so what a closed chapter says is now true: everything later has to agree with it.
   If the reader says something does not add up, settle it in clock.md first — how it really is across the whole book, in agreement with every chapter already closed — and only then revise the chapter to match. Do not answer a reader by changing the facts in one chapter.
3. You may go back into a closed chapter only to set up something a later chapter turned out to need: a thing on a table, a line someone says. Small insertions, with edit, at most twice per chapter.
4. Budget. Every answer costs one call; ask_character and ask_reader cost two. When it reaches zero you are stopped mid-sentence. An unfinished book is the worst outcome.

YOUR TOOLS. Each answer uses exactly one tool, in exactly this form:

THOUGHT: one or two sentences on what you are doing and why
TOOL: write | append | edit | close | read | search | ask_character | ask_reader | done
FILE: the file (for write, append, edit, close, read, ask_reader)
NAME: the character (for ask_character)
---
the content

- write replaces the whole file. append adds to its end.
- edit (closed chapters only, to insert): chapters are shown with numbered paragraphs, [1], [2], ... The content is one or more insertions, each starting with a line holding only #N+ (insert the text that follows after paragraph N). Use read to see a closed chapter's numbers. An open chapter is revised with write.
- close: FILE is the chapter. The content has two parts separated by a line containing only ===. First its card, five to eight lines for your own later use: what happened, what the reader now knows and fears, what was set up and not yet paid off. Then its facts, one per line, which are added to dossier.md for you: every date, day and hour the chapter commits to; how each person is named and titled; who has which object and where it is at the end; what each person now knows.
- read: shows you a closed chapter in full, once. search: the content is a word or phrase; you get every line of the book containing it.
- ask_character: another mind answers as that person, alone, knowing only what you tell it. The content is what that person knows and wants, and your question. For when you need someone to act from inside rather than for your convenience.
- ask_reader: a stranger reads the book from page one to the end of the chapter in FILE, knowing nothing else, and says what they expect, where they lost interest, what they did not follow.
- done: the book is finished. No content.`;

const cardsView = () => chapterFiles.filter(name => state[name] === 'closed').map(name => `${name} (${count(desk[name])} words) — ${cards[name]}`).join('\n\n');
const current = () => chapterFiles.find(name => state[name] !== 'closed');
const view = () => {
  const now = current(), at = now ? chapterFiles.indexOf(now) : chapters;
  const open = [at > 0 ? chapterFiles[at - 1] : '', now || ''].filter(Boolean);
  return `YOUR NOTES:\n${notes.map(name => `===== ${name} (${count(desk[name])} words) =====\n${desk[name] || '(empty)'}`).join('\n\n')}`
    + `\n\nCLOSED CHAPTERS, BY YOUR CARDS:\n${cardsView() || '(none closed yet)'}`
    + `\n\nCHAPTERS OPEN ON THE DESK:\n${open.map(name => `===== ${name} — ${state[name]}${state[name] === 'drafted' ? (owesClock[name] ? ', read by a reader who found something that does not add up: settle it in clock.md first, then revise once, then close' : readBy[name] ? ', read by a reader; one revision left, then close it' : '; a reader may read it once, you may revise it once, then close it') : state[name] === 'revised' ? '; revised: close it with its card' : ''} (${count(desk[name])} words) =====\n${desk[name] ? numbered(desk[name]) : '(not written yet)'}`).join('\n\n') || '(all chapters are closed)'}`
    + `\n\nANSWERS YOU WERE GIVEN AND HAVE NOT YET ACTED ON:\n${answers.length ? answers.map(answer => `[${answer.about}] ${answer.text}`).join('\n\n') : '(none)'}`
    + `\n\nYOUR JOURNAL — what you did at each step and why, in your own words (latest last):\n${journal.length ? journal.slice(-40).join('\n') : '(nothing yet)'}`
    + `\n\nCHAPTERS CLOSED: ${chapterFiles.filter(name => state[name] === 'closed').length} of ${chapters}. BUDGET LEFT: ${budget} calls.${now && budget < (chapters - at) * 3 + 2 ? ' That is barely enough to finish: write and close, ask nobody.' : ''}\nYour next answer, in the form given:`;
};

const field = (text: string, name: string) => text.match(new RegExp(`^\\**${name}\\**:\\s*(.*)$`, 'mi'))?.[1].trim() || '';
const save = () => { for (const [name, text] of Object.entries(desk)) writeFileSync(join(out, name), text); writeFileSync(join(out, 'cards.md'), cardsView()); writeFileSync(join(out, 'journal.md'), journal.join('\n')); };

(async () => {
  let result = '';
  while (budget > 0) {
    const answer = await ask((result ? `RESULT OF YOUR LAST TOOL:\n${result}\n\n` : '') + view(), AUTHOR, 0.8, 6500);
    result = '';
    const split = answer.search(/\n-{3,}[ \t]*\n/);
    const head = split >= 0 ? answer.slice(0, split) : answer, content = split >= 0 ? answer.slice(split).replace(/^\n-{3,}[ \t]*\n/, '') : '';
    const tool = field(head, 'TOOL').toLowerCase().replace(/[^a-z_]/g, ''), file = field(head, 'FILE').replace(/[`"'*]/g, '').trim(), name = field(head, 'NAME').replace(/[*]/g, ''), thought = field(head, 'THOUGHT');
    const step = total - budget;
    log(`\n[${step}] ${tool || '??'} ${file || name || ''} — ${thought.slice(0, 260)}`);
    journal.push(`${step}. [${tool || 'no tool'}${file || name ? ' ' + (file || name) : ''}] ${thought.slice(0, 320)}`);
    const refuse = (why: string) => { result = why; done.push(`${tool} ${file || name}: refused — ${why.slice(0, 110)}`); journal[journal.length - 1] += ` — REFUSED: ${why.slice(0, 140)}`; log('   refused: ' + why.slice(0, 200)); };
    const isChapter = chapterFiles.includes(file), now = current();

    if (tool === 'done') {
      if (now && budget > 2) { refuse(`The book is not finished: ${now} is not closed. Write and close the remaining chapters.`); continue; }
      done.push('done'); break;
    }
    if (['write', 'append', 'edit', 'close', 'read'].includes(tool) && !(file in desk)) { refuse(`There is no file "${file}". Your files: ${Object.keys(desk).join(', ')}.`); continue; }

    if (tool === 'write' || tool === 'append') {
      if (isChapter) {
        if (!desk['clock.md'].trim()) { refuse('clock.md is empty. Before any chapter: who does the worst thing, with whose hands, where and at what hour; where everyone else is at that hour and who could swear to it; and the line HOW IT COMES OUT: with the thing the truth comes out by and the chapter where the reader first sees it. Write clock.md first.'); continue; }
        const shown = Number(comesOut(desk['clock.md']).match(/chapter\s+(\d+)/i)?.[1] || 0);
        if (!shown || shown > Math.max(1, chapters - 2)) { refuse(`clock.md needs one line beginning HOW IT COMES OUT: that names the thing the truth finally comes out by and the chapter in which the reader first sees it, as "chapter N", with N no later than ${Math.max(1, chapters - 2)}. ${shown ? `It says chapter ${shown}: too late — the reader must have seen it long before the ending uses it.` : 'That line is missing.'}`); continue; }
        if (state[file] === 'closed') { refuse(`${file} is closed and cannot be rewritten. To set up something a later chapter needs, use edit with a small addition.`); continue; }
        if (file !== now) { refuse(`Chapters are written in order. The one on your desk is ${now}.`); continue; }
        if (state[file] === 'revised') { refuse(`${file} has had its revision. Close it with its card and go on.`); continue; }
        if (owesClock[file]) { refuse(`The reader found something in ${file} that does not add up. Settle it in clock.md first — how it really is across the whole book, agreeing with every closed chapter — then revise.`); continue; }
      }
      const before = desk[file];
      const next = tool === 'write' ? content.trim() : (desk[file] + '\n\n' + content.trim()).trim();
      if (file === 'clock.md') {
        if (desk[chapterFiles[0]].trim() && clockTurns < 1) { refuse(`clock.md already carries your answer and stands as it is. ${current() ? `Now ${state[current()!] === 'drafted' ? `revise ${current()} once by writing it whole, or close it` : state[current()!] === 'revised' ? `close ${current()}` : `write ${current()}`}.` : ''} The clock opens again only when a reader finds something that does not add up.`); continue; }
        if (count(next) > 900) { refuse(`clock.md would be ${count(next)} words. It holds facts by the day and hour, at most 900 words: no reasons, no argument, no account of what a reader said. Put the reasoning in notebook.md and keep the clock to what is true and when.`); continue; }
        const closed = chapterFiles.filter(chapter => state[chapter] === 'closed').length;
        if (closed >= chapters / 2) { fixedComesOut ||= comesOut(desk['clock.md']); if (comesOut(next) !== fixedComesOut) { refuse(`Half the book is closed, so what the truth comes out by is settled and the reader has been shown it. That line stays word for word: "${fixedComesOut}". The ending has to be made of what is already in the book.`); continue; } }
      }
      desk[file] = isChapter ? cleanChapter(next) : next;
      if (file === 'clock.md') { for (const chapter of chapterFiles) owesClock[chapter] = false; if (desk[chapterFiles[0]].trim()) clockTurns = 0; result = `clock.md is rewritten (${count(next)} words) and is now the truth of the book. That objection is settled; do not rewrite the clock again for it. ${current() && state[current()!] === 'drafted' ? `Next: revise ${current()} once, by writing the whole chapter again to agree with the clock, or close it.` : ''}`; }
      else if (isChapter) result = `${file} is ${state[file] === 'empty' || !before.trim() ? 'drafted' : 'revised'} (${count(desk[file])} words). ${before.trim() && tool === 'write' ? 'That was its one revision: close it now with its card and facts.' : 'You may have one reader read it, revise it once by writing it whole, or close it.'}`;
      if (isChapter) {
        if (state[file] === 'empty' || tool === 'append' && !readBy[file]) state[file] = 'drafted'; else state[file] = 'revised';
        if (before.trim() && tool === 'write') answers = answers.filter(item => item.about !== `a reader, through ${file}`);
      }
      done.push(`${tool === 'write' ? 'wrote' : 'appended to'} ${file} (${count(desk[file])} words)${isChapter && state[file] === 'revised' ? ', its one revision' : ''}: ${thought.slice(0, 120)}`);
    } else if (tool === 'edit') {
      if (!isChapter) { refuse('edit is for chapters, by paragraph number. For notes use write or append.'); continue; }
      if (state[file] === 'closed' && (plants[file] || 0) >= 2) { refuse(`${file} has been reopened twice already. It stays as it is.`); continue; }
      if (state[file] !== 'closed') { refuse(`${file} is still open: revise it by writing the whole chapter again with write${state[file] === 'revised' ? ' — but it has had its one revision, so close it' : ''}. edit is only for inserting into a closed chapter.`); continue; }
      const parts = paragraphs(desk[file]);
      const changes: { at: number; mode: string; text: string }[] = [];
      for (const line of content.split('\n')) {
        const mark = line.trim().match(/^#\s*(\d+)\s*([+-]?)$/);
        if (mark) changes.push({ at: Number(mark[1]), mode: mark[2], text: '' });
        else if (changes.length) changes[changes.length - 1].text += line + '\n';
      }
      const wrong = changes.filter(change => change.at < 1 || change.at > parts.length || change.mode !== '-' && !change.text.trim());
      if (!changes.length || wrong.length) { refuse(!changes.length ? 'No change was given. Each change starts with a line holding only #N, #N+ or #N-, where N is a paragraph number shown on your desk.' : `${file} has paragraphs 1 to ${parts.length}. Not usable: ${wrong.map(change => '#' + change.at + change.mode + (change.text.trim() ? '' : ' (no text)')).join(', ')}. Nothing was changed.`); continue; }
      if (state[file] === 'closed' && changes.some(change => change.mode !== '+')) { refuse(`${file} is closed: you may only insert (#N+) something a later chapter needs.`); continue; }
      for (const change of [...changes].sort((a, b) => b.at - a.at)) {
        const text = unnumbered(change.text);
        if (change.mode === '-') parts.splice(change.at - 1, 1); else if (change.mode === '+') parts.splice(change.at, 0, text); else parts.splice(change.at - 1, 1, text);
      }
      desk[file] = parts.join('\n\n');
      if (state[file] === 'closed') plants[file] = (plants[file] || 0) + 1;
      else { state[file] = 'revised'; answers = answers.filter(item => item.about !== `a reader, through ${file}`); }
      done.push(`edited ${file} (${changes.length} paragraph${changes.length > 1 ? 's' : ''})${state[file] === 'revised' ? ', its one revision' : ''}: ${thought.slice(0, 120)}`);
    } else if (tool === 'close') {
      if (!isChapter || file !== now) { refuse(`The chapter to close is ${now || 'none: all are closed'}.`); continue; }
      if (!desk[file].trim()) { refuse(`${file} is not written yet.`); continue; }
      const lastLine = paragraphs(desk[file]).at(-1) || '';
      if (!/[.!?…"”’'*)]\s*$/.test(lastLine)) { refuse(`${file} stops in the middle of a sentence: "…${lastLine.slice(-90)}". Finish it${state[file] === 'revised' ? ' (this one repair is allowed)' : ''}, then close.`); if (state[file] === 'revised') { state[file] = 'drafted'; readBy[file] = true; } continue; }
      const [card, facts] = content.split(/\n={3,}[ \t]*\n/);
      if (count(card || '') < 25) { refuse('A card needs five to eight lines: what happened, what the reader now knows and fears, what is set up and unpaid.'); continue; }
      const lines = (facts || '').split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length < 4) { refuse('After the card, a line containing only ===, then the facts of this chapter for the dossier, one per line: every date, day and hour it commits to; how each person is named and titled; who has which object and where it is at the end; what each person now knows.'); continue; }
      desk['dossier.md'] = (desk['dossier.md'] + `\n\n## From ${file}\n${lines.join('\n')}`).trim();
      state[file] = 'closed'; cards[file] = (card || '').trim();
      if (!fixedComesOut && chapterFiles.filter(chapter => state[chapter] === 'closed').length >= chapters / 2) fixedComesOut = comesOut(desk['clock.md']); answers = answers.filter(item => item.about !== `a reader, through ${file}`);
      done.push(`closed ${file} (${count(desk[file])} words)`);
    } else if (tool === 'read') {
      result = `${file} in full:\n${isChapter ? numbered(desk[file]) : desk[file] || '(empty)'}`; done.push(`read ${file}`);
    } else if (tool === 'search') {
      const phrase = content.trim().split('\n')[0].toLowerCase();
      const hits = chapterFiles.flatMap(chapter => desk[chapter].split('\n').filter(line => phrase && line.toLowerCase().includes(phrase)).map(line => `${chapter}: ${line.slice(0, 300)}`));
      result = hits.length ? `"${phrase}" — ${hits.length} line(s):\n${hits.slice(0, 25).join('\n')}` : `"${phrase}" does not occur in the book.`; done.push(`searched "${phrase.slice(0, 40)}" (${hits.length})`);
    } else if (tool === 'ask_character') {
      if (budget < (chapters - chapterFiles.filter(chapter => state[chapter] === 'closed').length) * 3 + 2) { refuse('There is not enough budget left to ask anyone. Write and close.'); continue; }
      const said = await ask(content, `You are ${name || 'a person'} in a novel, and you do not know you are in one. You know only what you are told below. Answer in the first person, as yourself, plainly and specifically: what you do, what you say, what you will not say. You look after your own interests. Under 250 words.`, 0.9, 1200, helper);
      answers = [...answers.filter(item => !item.about.startsWith('a reader')).slice(-2), ...answers.filter(item => item.about.startsWith('a reader')), { about: name, text: said }];
      done.push(`asked ${name}: ${thought.slice(0, 120)}`); log('   ' + said.slice(0, 400).replace(/\n/g, ' '));
    } else if (tool === 'ask_reader') {
      const target = isChapter ? file : now || chapterFiles.at(-1)!;
      if (target !== now || state[target] !== 'drafted') { refuse(`A reader reads the chapter you have just drafted, once, before you revise it. ${now ? `That is ${now}, which is ${state[now]}.` : 'All chapters are closed.'}`); continue; }
      if (readBy[target]) { refuse(`${target} has had its reader. What they said is on your desk. Revise once or close.`); continue; }
      if (budget < (chapters - chapterFiles.indexOf(target)) * 3 + 2) { refuse('There is not enough budget left for a reader. Close this chapter and write the next.'); continue; }
      const upTo = chapterFiles.indexOf(target), last = upTo + 1 >= chapters;
      const book = chapterFiles.slice(0, upTo + 1).map(chapter => desk[chapter]).join('\n\n');
      const said = await ask(`${book}\n\n---\nThat is ${last ? 'a whole short novel' : `the first ${upTo + 1} chapter${upTo ? 's' : ''} of a novel`} you picked up in a shop. You know nothing else about it.${content.trim() ? ' The author asks: ' + content.trim() : ''}\nSay honestly, as a reader and not as an editor, about the LAST chapter you read: ${last ? 'whether the ending satisfied you' : 'whether you would turn the page'}, and why; what you think is going on${last ? '' : ' and what you expect next'}; the exact place where your attention slipped, if it did; and then, on a last line beginning DOES NOT ADD UP:, anything that contradicts what came before — a date or hour, a place, who has which object, who knew what, who could have done it — or the single word nothing. Under 220 words.`, 'You are an ordinary reader of thrillers. You are not a writer and you give no advice on craft.', 0.7, 1100, helper);
      readBy[target] = true; answers.push({ about: `a reader, through ${target}`, text: said });
      const gap = said.split(/DOES NOT ADD UP:?/i)[1]?.trim() || '';
      owesClock[target] = gap.length > 12 && !/^\W*nothing\b/i.test(gap);
      if (owesClock[target]) clockTurns = 1;
      done.push(`a reader read through ${target}`); log('   ' + said.slice(0, 600).replace(/\n/g, ' '));
    } else { result = `"${tool}" is not one of your tools. Answer in the form given, with one tool.`; done.push('an answer that used no tool'); }
    save();
  }
  save();
  log(`\nFINISHED. Budget left ${budget} of ${total}. Chapters: ${chapterFiles.map(name => `${count(desk[name])}${state[name] === 'closed' ? '' : '(' + state[name] + ')'}`).join(', ')} words. Notes: ${notes.map(name => `${name} ${count(desk[name])}`).join(', ')}.`);
})().catch(error => { save(); log(`\nSTOPPED BY AN ERROR: ${error instanceof Error ? error.message : error}`); process.exit(1); });
