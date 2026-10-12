/**
 * The author writes the book once. An experiment that follows from three runs of
 * author-experiment.ts: the model wrote a clean, living chapter in one pass and spent more
 * than half its calls going round in whatever tool it was given to correct with.
 *
 * So here nothing is corrected. The clock and the plan are settled first. Then each chapter
 * is written once and closed with its card and facts. A reader reads after every chapter and
 * says what they are waiting for and what did not add up; both go forward, into the next
 * chapter's desk, and into the report. Closed text and the clock are never reopened.
 *
 *   npx vite-node scripts/author-once.ts --provider ollama --model deepseek-v4.1-flash:cloud --chapters 8 --words 2000 --premise "..." --out runs/once
 *   npx vite-node scripts/author-once.ts --provider qwen --model qwen3.8-max ...
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateOllamaText } from '../services/ollamaService';
import { generateQwenText } from '../services/qwenService';

const arg = (name: string, fallback: string) => { const at = process.argv.indexOf(`--${name}`); return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback; };
const provider = arg('provider', 'ollama'), model = arg('model', 'deepseek-v4.1-flash:cloud'), endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const readerModel = arg('reader', 'deepseek-v4.1-flash:cloud');
const out = arg('out', 'runs/once'), premise = arg('premise', ''), settings = arg('settings', '');
const words = Number(arg('words', '2000')), chapters = Number(arg('chapters', '8'));
if (!premise) throw new Error('--premise is required');
mkdirSync(out, { recursive: true });
const started = Date.now();
let calls = 0, sent = 0, got = 0;
const log = (line: string) => { console.log(line); appendFileSync(join(out, 'log.txt'), line + '\n'); };
const count = (text: string) => text.split(/\s+/).filter(Boolean).length;

const call = async (who: 'author' | 'reader', prompt: string, system: string, temperature: number, maxTokens: number): Promise<string> => {
  calls++; sent += prompt.length + system.length;
  for (let attempt = 1; ; attempt++) {
    try {
      const text = (who === 'author' && provider === 'qwen' ? await generateQwenText(prompt, system, maxTokens, model, temperature)
        : await generateOllamaText(prompt, system, undefined, temperature, who === 'author' ? model : readerModel, endpoint, maxTokens)).trim();
      if (!text) throw new Error('empty answer');
      got += text.length; return text;
    } catch (error) { if (attempt >= 3) throw error; log(`   (no answer: ${error instanceof Error ? error.message.slice(0, 140) : error}; trying again)`); await new Promise(resolve => setTimeout(resolve, 6000 * attempt)); }
  }
};

const AUTHOR = `You are the author of a commercial thriller that is meant to sell: a book a stranger opens in a shop and cannot put back. It is your book. Nobody corrects it, and neither do you: each thing you write is written once and stands. So decide before you write, and write what you decided.

THE PREMISE YOU WERE GIVEN:
${premise}
${settings ? `\nWHAT THE PUBLISHER PUT ON THE FORM (keep to it):\n${settings}\n` : ''}
THE BOOK: the whole story, complete, in ${chapters} chapters of about ${words} words each. It begins, turns, gets worse and ends inside these chapters.${arg('intimacy', 'page') === 'page' ? ' Intimate scenes are written on the page, adult and direct, not faded out.' : ' Intimate scenes are implied and not described: the scene cuts away.'} Written in English.`;

const comesOut = (text: string) => text.split('\n').find(line => /^\W*HOW IT COMES OUT:/i.test(line))?.trim() || '';
const paragraphs = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
const clean = (text: string) => { const seen = new Set<string>(); return paragraphs(text).filter(part => { if (part.length < 80) return true; if (seen.has(part)) return false; seen.add(part); return true; }).join('\n\n'); };

/** Ask until the answer passes, at most three times; each refusal says exactly what is missing. */
const settled = async (label: string, prompt: string, maxTokens: number, check: (text: string) => string): Promise<string> => {
  let refusal = '', text = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    text = await call('author', prompt + (refusal ? `\n\nYOUR LAST ANSWER WAS NOT USABLE: ${refusal}\nWrite it again, whole, with that put right.` : ''), AUTHOR, 0.8, maxTokens);
    refusal = check(text);
    if (!refusal) return text;
    log(`   ${label}: not usable (${refusal.slice(0, 160)})`);
  }
  log(`   ${label}: kept as written after three tries.`);
  return text;
};

(async () => {
  log(`Author: ${provider}:${model}. Reader: ollama:${readerModel}. ${chapters} chapters of about ${words} words.`);

  const clock = await settled('clock', `Before anything else, the clock of this story: facts by the day and hour, and no reasons. At most 700 words.
- Who does the worst thing in this story, with whose hands, where, on what date and at what hour.
- Where every other person is at that hour, and who could swear to it.
- The dates the book turns on, as a calendar: day of the week and date for each, from the first scene to the last. Count the weeks; they have to add up.
- Every object the plot depends on: what it is, whose it is, where it is at the start and where it ends.
- One line beginning HOW IT COMES OUT: naming the one thing the truth finally comes out by — an object, a record, a person who saw — and the chapter in which the reader first sees it, written as "chapter N", with N no later than ${Math.max(1, chapters - 3)}. An ending that rests on something the reader was never shown is a cheat.
Every time, place and name in it must agree with every other. Return only the clock.`, 2600, text => {
    const shown = Number(comesOut(text).match(/chapter\s+(\d+)/i)?.[1] || 0);
    return count(text) > 850 ? `It is ${count(text)} words; at most 700. Facts only.` : !shown ? 'The line beginning HOW IT COMES OUT: with "chapter N" is missing.' : shown > Math.max(1, chapters - 3) ? `HOW IT COMES OUT says chapter ${shown}; the reader must first see it no later than chapter ${Math.max(1, chapters - 3)}.` : '';
  });
  writeFileSync(join(out, 'clock.md'), clock); log(`[clock] ${count(clock)} words. ${comesOut(clock).slice(0, 260)}`);

  const plan = await settled('plan', `YOUR CLOCK (settled; it does not change):\n${clock}\n\nNow the plan of the book, for your own use while writing: ${chapters} chapters. For each, in three or four lines: what happens, where, and between whom; what the reader comes to know or fear; the turn it ends on; and anything it must set down in passing that a later chapter will need — including the thing the truth comes out by, in the chapter your clock names. The worst thing happens on the page or the protagonist walks in on it. The last decisive act is the protagonist's, in person, at a cost. At most 900 words. Return only the plan.`, 3200,
    text => count(text) > 1100 ? `It is ${count(text)} words; at most 900.` : Array.from({ length: chapters }, (_, at) => at + 1).filter(n => !new RegExp(`(chapter|ch\\.?)\\s*${n}\\b|^\\W*${n}[.):]`, 'im').test(text)).length > 2 ? `It must have an entry for each of the ${chapters} chapters, numbered.` : '');
  writeFileSync(join(out, 'plan.md'), plan); log(`[plan] ${count(plan)} words.`);

  const texts: string[] = [], cards: string[] = [], facts: string[] = [], noticed: string[] = [];
  let waiting = '';
  for (let n = 1; n <= chapters; n++) {
    const desk = `YOUR CLOCK (settled):\n${clock}\n\nYOUR PLAN:\n${plan}`
      + (facts.length ? `\n\nTHE DOSSIER — what the closed chapters have committed the book to. This is now true; agree with it exactly:\n${facts.map((item, at) => `From chapter ${at + 1}:\n${item}`).join('\n')}` : '')
      + (cards.length > 1 ? `\n\nEARLIER CHAPTERS, BY YOUR CARDS:\n${cards.slice(0, -1).map((card, at) => `Chapter ${at + 1}: ${card}`).join('\n\n')}` : '')
      + (texts.length ? `\n\nTHE CHAPTER BEFORE THIS ONE, IN FULL:\n${texts.at(-1)}` : '')
      + (waiting ? `\n\nA READER WHO HAS READ THIS FAR SAYS WHAT THEY ARE WAITING FOR. Give it, delay it or turn it on its head; do not ignore it, and do not simply do what they expect:\n${waiting}` : '')
      + (noticed.length ? `\n\nTHINGS READERS NOTICED THAT DID NOT ADD UP. The closed chapters cannot be changed. Do not explain these away in the text; simply make sure nothing from here on makes them worse, and where a later line can quietly make a thing consistent, let it:\n${noticed.slice(-6).join('\n')}` : '');
    const answer = await settled(`chapter ${n}`, `${desk}\n\nNow write chapter ${n} of ${chapters}, about ${words} words, once and whole. ${n === chapters ? 'This is the last chapter: its last page is the end of the book.' : ''}
Then, after the chapter, a line containing only === CARD, and its card for your own later use, five to eight lines: what happened, what the reader now knows and fears, what was set up and not yet paid off.
Then a line containing only === FACTS, and the facts this chapter has committed the book to, one per line: every day, date and hour; how each person is named and titled; who has which object and where it is at the end; what each person now knows.`, 7000, text => {
      const [body, rest] = text.split(/\n\s*={3,}\s*CARD\s*\n/i);
      const [card, fact] = (rest || '').split(/\n\s*={3,}\s*FACTS\s*\n/i);
      const last = paragraphs(body || '').at(-1) || '';
      return count(body || '') < words * 0.5 ? `The chapter is ${count(body || '')} words; it should be about ${words}.` : !/[.!?…"”’'*)]\s*$/.test(last) ? 'The chapter stops in the middle of a sentence.' : count(card || '') < 25 ? 'The card after === CARD is missing or too short.' : (fact || '').split('\n').filter(line => line.trim()).length < 4 ? 'The facts after === FACTS are missing: at least four lines.' : '';
    });
    const [body, rest] = answer.split(/\n\s*={3,}\s*CARD\s*\n/i);
    const [card, fact] = (rest || '').split(/\n\s*={3,}\s*FACTS\s*\n/i);
    texts.push(clean(body)); cards.push((card || '').trim()); facts.push((fact || '').trim());
    writeFileSync(join(out, `chapter-${n}.md`), texts.at(-1)!); writeFileSync(join(out, 'dossier.md'), facts.map((item, at) => `## Chapter ${at + 1}\n${item}`).join('\n\n')); writeFileSync(join(out, 'cards.md'), cards.map((item, at) => `## Chapter ${at + 1}\n${item}`).join('\n\n'));
    log(`[chapter ${n}] ${count(texts.at(-1)!)} words.`);

    const said = await call('reader', `${texts.join('\n\n')}\n\n---\nThat is ${n === chapters ? 'a whole short novel' : `the first ${n} chapter${n > 1 ? 's' : ''} of a novel`} you picked up in a shop. You know nothing else about it. Answer as a reader, not as an editor, in under 200 words, in exactly three parts:
WAITING FOR: ${n === chapters ? 'whether the ending gave you what the book had made you wait for, and what it left you with' : 'what you are now waiting to find out, and what you expect will happen next'}.
SLIPPED: the exact place in the LAST chapter where your attention slipped, if it did, or the word nowhere.
DOES NOT ADD UP: anything in the last chapter that contradicts what came before — a date or hour, a place, who has which object, who knew what, who could have done it — or the word nothing.`, 'You are an ordinary reader of thrillers. You are not a writer and you give no advice on craft.', 0.7, 900);
    waiting = (said.split(/SLIPPED:/i)[0] || '').replace(/WAITING FOR:/i, '').trim();
    const gap = (said.split(/DOES NOT ADD UP:/i)[1] || '').trim();
    if (gap.length > 12 && !/^\W*nothing\b/i.test(gap)) noticed.push(`After chapter ${n}: ${gap.replace(/\s+/g, ' ').slice(0, 500)}`);
    appendFileSync(join(out, 'readers.md'), `## After chapter ${n}\n${said}\n\n`);
    log(`   reader: ${said.replace(/\s+/g, ' ').slice(0, 420)}`);
  }
  writeFileSync(join(out, 'noticed.md'), noticed.join('\n\n'));
  log(`\nFINISHED in ${Math.round((Date.now() - started) / 60000)} min. ${calls} calls, ${Math.round(sent / 1000)}K characters sent, ${Math.round(got / 1000)}K received. Chapters: ${texts.map(count).join(', ')} words (${texts.reduce((sum, text) => sum + count(text), 0)} in all). Readers found something that did not add up after ${noticed.length} of ${chapters} chapters.`);
})().catch(error => { log(`\nSTOPPED BY AN ERROR: ${error instanceof Error ? error.message : error}`); process.exit(1); });
