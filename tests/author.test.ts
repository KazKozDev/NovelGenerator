import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { authorKey, chapterFault, cleanChapter, clockFault, deskFor, readChapter, readReader, wornPhrases, type AuthorDraft } from '../utils/novel/v3/author';

const input = { premise: 'Nora hides a notebook.', author_requirements: 'Voice: third-limited.', genre: 'thriller', chapter_count: 4, target_total_words: 1200, planning_version: 2 as const };
const words = (n: number, word = 'word') => Array.from({ length: n }, () => word).join(' ');
const clock = `Nora burns the notebook on Thursday 2 May at nine.\nHOW IT COMES OUT: the ash in the grate, which the reader first sees in chapter 1.`;
const chapter = (n: number) => `Chapter ${n} begins. ${words(300)} It ends here.\n=== CARD\n${words(30, 'card')}\n=== FACTS\nThursday 2 May\nNora is Mrs. Blake\nThe notebook is in the grate\nPaul knows nothing`;

/** A book begun by the fixed sequence is finished by it; a new book goes to the author's desk (see authorDesk.test.ts). */
const sequenced = () => { const store = new MemoryProjectStore(); store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false }); return store; };

/** A model that plays author and reader, and records every stage it is asked for. */
const author = (stages: string[], prompts: Record<string, string[]> = {}, reader = (n: number) => `WAITING FOR: what is in the notebook after ${n}.\nSLIPPED: nowhere\nDOES NOT ADD UP: nothing`): NovelLLM => async (prompt, _system, options) => {
  const stage = options?.stage || ''; stages.push(stage); (prompts[stage] ||= []).push(prompt);
  if (stage === 'author-notebook') return `NOTEBOOK: told by Nora, first person, past. ${words(300, 'note')}`;
  if (stage === 'author-clock') return clock;
  if (stage === 'author-plan') return words(60, 'plan');
  if (stage === 'author-chapter') return chapter(prompts[stage].length);
  if (stage === 'author-reader') return reader(prompts[stage].length);
  throw new Error(`The author must not be asked for ${stage}`);
};

describe('the author writes the book once, in a fixed sequence', () => {
  it('goes notebook, clock, plan, then each chapter once and a reader after it, and nothing else', async () => {
    const store = sequenced(); const stages: string[] = [];
    const result = await new Orchestrator(store).runBook(input, author(stages));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(stages).toEqual(['author-notebook', 'author-clock', 'author-plan', ...Array.from({ length: 4 }, () => ['author-chapter', 'author-reader']).flat()]);
    expect(store.loadInput()!.generation_mode).toBe('author');
    expect(store.manuscript().map(item => item.chapter)).toEqual([1, 2, 3, 4]);
    expect(store.manuscript()[0].text).toContain('Chapter 1 begins.');
    expect(store.manuscript()[0].text).not.toContain('CARD');
    expect(store.loadAuthor()!.completed).toBe(true);
    expect(store.loadTheses()).toBeNull();
  });

  it('carries forward what the reader is waiting for and what did not add up, and reports it without rewriting anything', async () => {
    const store = sequenced(); const stages: string[] = []; const prompts: Record<string, string[]> = {};
    const result = await new Orchestrator(store).runBook(input, author(stages, prompts, n => `WAITING FOR: who lit the fire after ${n}.\nSLIPPED: nowhere\nDOES NOT ADD UP: ${n === 2 ? 'The notebook was in the drawer in chapter one and is in the grate now.' : 'nothing'}`));
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(prompts['author-chapter'][1]).toContain('who lit the fire after 1');
    // The notebook is written first and is on the desk for the clock, the plan and every chapter.
    for (const stage of ['author-clock', 'author-plan']) expect(prompts[stage][0]).toContain('NOTEBOOK: told by Nora, first person, past.');
    for (const prompt of prompts['author-chapter']) expect(prompt).toContain('NOTEBOOK: told by Nora, first person, past.');
    // From the third chapter on, the first page of the book is there as its voice.
    expect(prompts['author-chapter'][2]).toContain('THE FIRST PAGE OF THE BOOK. This is its voice; every chapter is told in it:\nChapter 1 begins.');
    expect(prompts['author-chapter'][1]).toContain('From chapter 1:\nThursday 2 May');
    // The chapter before is given by its last page, not whole, so that it is not copied.
    expect(prompts['author-chapter'][1]).toContain('It ends here.');
    expect(prompts['author-chapter'][1].split('WHERE THE CHAPTER BEFORE THIS ONE LEFT OFF')[1].split('HOW THE CHAPTERS SO FAR')[0]).not.toContain('Chapter 1 begins.');
    expect(prompts['author-chapter'][2]).toContain('After chapter 2: The notebook was in the drawer');
    expect(prompts['author-chapter'][2]).toContain('The closed chapters cannot be changed');
    // The reader sees the text and nothing of the author's desk.
    expect(prompts['author-reader'][0]).not.toContain('HOW IT COMES OUT');
    expect(stages.filter(stage => stage === 'author-chapter')).toHaveLength(4);
    expect(store.loadReport()!.findings.map(finding => finding.description)).toEqual(['After chapter 2: The notebook was in the drawer in chapter one and is in the grate now.']);
  });

  it('goes on from the chapter it stopped at, asking for nothing it already has', async () => {
    const store = sequenced(); const first: string[] = []; let calls = 0;
    const stopping: NovelLLM = async (prompt, system, options) => { if (options?.stage === 'author-chapter' && ++calls === 3) throw new Error('The connection dropped'); return author(first, {})(prompt, system, options); };
    const stopped = await new Orchestrator(store).runBook(input, stopping);
    expect(stopped.status).toBe('FAILED'); expect(stopped.stoppedReason).toContain('The connection dropped');
    expect(store.loadAuthor()!.chapters).toHaveLength(2);
    const second: string[] = []; const prompts: Record<string, string[]> = {};
    const resumed = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      const stage = options?.stage || ''; second.push(stage); (prompts[stage] ||= []).push(prompt);
      return stage === 'author-chapter' ? chapter(2 + prompts[stage].length) : author([], {})(prompt, system, options);
    });
    expect(resumed.status, resumed.stoppedReason || '').toBe('COMPLETE');
    expect(second).toEqual(['author-chapter', 'author-reader', 'author-chapter', 'author-reader']);
    expect(store.manuscript()).toHaveLength(4);
  });

  it('writes the book without its reader when the reader cannot be reached', async () => {
    const store = sequenced(); const stages: string[] = [];
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => { if (options?.stage === 'author-reader') { stages.push('author-reader'); throw new Error('No reader today'); } return author(stages, {})(prompt, system, options); });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(store.manuscript()).toHaveLength(4);
    expect(store.runLog().some(entry => entry.detail.includes('No reader after chapter 1'))).toBe(true);
  });

  it('asks again, saying exactly what is missing, and at most three times', async () => {
    const store = sequenced(); const prompts: string[] = []; let clocks = 0;
    await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'author-clock') { prompts.push(prompt); return ++clocks === 1 ? 'Nora burns it on Thursday.' : clock; }
      return author([], {})(prompt, system, options);
    });
    expect(clocks).toBe(2);
    expect(prompts[1]).toContain('YOUR LAST ANSWER WAS NOT USABLE: The line beginning HOW IT COMES OUT: with "chapter N" is missing.');
  });
});

describe('what code checks, without reading', () => {
  it('finds a clock with no proof named, a proof shown too late, and a clock that argues', () => {
    expect(clockFault('Nora burns it.', 8)).toContain('is missing');
    expect(clockFault('HOW IT COMES OUT: the ash, first seen in chapter 7.', 8)).toContain('no later than chapter 5');
    expect(clockFault('HOW IT COMES OUT: the ash, first seen in chapter 2.\n' + words(900), 8)).toContain('at most 700');
    expect(clockFault(clock, 8)).toBe('');
  });
  it('finds a chapter that is short, stops mid-sentence, or came without its card and facts', () => {
    expect(chapterFault(`${words(20)}.\n=== CARD\n${words(30)}\n=== FACTS\na\nb\nc\nd`, 100)).toContain('should be about 100');
    expect(chapterFault(`${words(100)} and then she\n=== CARD\n${words(30)}\n=== FACTS\na\nb\nc\nd`, 100)).toBe('The chapter stops in the middle of a sentence.');
    expect(chapterFault(`${words(100)}.`, 100)).toContain('=== CARD');
    expect(chapterFault(`${words(100)}.\n=== CARD\n${words(30)}`, 100)).toContain('=== FACTS');
    expect(chapterFault(chapter(1), 100)).toBe('');
  });
  it('keeps a chapter as prose: no card in it, no paragraph twice', () => {
    const twice = 'She stood at the window for a long time and watched the street go dark below her, saying nothing.';
    expect(readChapter(`${twice}\n\nA short line.\n\n${twice}\n=== CARD\ncard\n=== FACTS\nfact`)).toEqual({ text: `${twice}\n\nA short line.`, card: 'card', facts: 'fact', threads: '' });
    expect(readChapter(`Text.\n=== CARD\ncard\n=== FACTS\nfact\n=== THREADS\nThe key: found in chapter 5`).threads).toBe('The key: found in chapter 5');
    expect(cleanChapter('Yes.\n\nYes.')).toBe('Yes.\n\nYes.');
    expect(cleanChapter('She listened.\n\n---\n\n**END OF CHAPTER SIX**\n\n---\n\n**THE HAND THAT SIGNED**\n\n*A novel*')).toBe('She listened.');
    expect(cleanChapter('It was the end of the chapter of her life.\n\nShe left.')).toBe('It was the end of the chapter of her life.\n\nShe left.');
  });
  it('does not take a rule before the card, a heading or closing italics for a chapter cut short', () => {
    const body = `# Chapter One\n\n## The Fifth Day\n\n${words(100)} and she let her in.\n\n---`;
    expect(chapterFault(`${body}\n=== CARD\n${words(30)}\n=== FACTS\na\nb\nc\nd`, 100)).toBe('');
    expect(readChapter(`${body}\n=== CARD\nc\n=== FACTS\nf`).text).toBe(`## The Fifth Day\n\n${words(100)} and she let her in.`);
    expect(chapterFault(`${words(100)} *I was home.*\n=== CARD\n${words(30)}\n=== FACTS\na\nb\nc\nd`, 100)).toBe('');
    expect(chapterFault(`${words(100)} and then she\n\n---\n=== CARD\n${words(30)}\n=== FACTS\na\nb\nc\nd`, 100)).toBe('The chapter stops in the middle of a sentence.');
  });
  it('takes from the reader what goes forward', () => {
    expect(readReader('WAITING FOR: the key.\nSLIPPED: nowhere\nDOES NOT ADD UP: nothing', 3)).toEqual({ waiting: 'the key.', noticed: '' });
    expect(readReader('WAITING FOR: the key.\nSLIPPED: the garden\nDOES NOT ADD UP: It was Tuesday and is now Friday.', 3).noticed).toBe('After chapter 3: It was Tuesday and is now Friday.');
  });
  it('shows the author every chapter by its card, the last page of the one before, what is still owed, and what the book has worn out', () => {
    const refrain = 'She looked at the middle distance and said nothing at all.';
    const draft: AuthorDraft = { version: 1, input_key: '', clock: 'CLOCK', plan: 'PLAN', waiting: 'the key', noticed: [], completed: false, threads: 'The scarf: explained in the last chapter',
      chapters: [1, 2, 3].map(n => ({ text: `Opening of chapter ${n} in the rain.\n\n${words(500, `middle${n}`)}\n\n${refrain}\n\nThe end of chapter ${n} came quietly.`, card: `CARD ${n}`, facts: `FACTS ${n}`, reader: '' })) };
    const desk = deskFor(draft, 4);
    for (const present of ['CLOCK', 'PLAN', 'FACTS 1', 'FACTS 3', 'Chapter 1: CARD 1', 'Chapter 3: CARD 3', 'The end of chapter 3 came quietly.', 'the key', 'The scarf: explained in the last chapter',
      'Chapter 1 opened: "Opening of chapter 1 in the rain."', 'and closed: "The end of chapter 2 came quietly."', '"she looked at the middle distance and said nothing at all" (3 times)']) expect(desk).toContain(present);
    // Of the chapter before, only its last page: the opening and the body are not handed over to be copied.
    expect(desk.split('WHERE THE CHAPTER BEFORE THIS ONE LEFT OFF')[1].split('HOW THE CHAPTERS SO FAR')[0]).not.toContain('Opening of chapter 3');
  });
  it('counts a phrase as worn only from its third use', () => {
    expect(wornPhrases(['a glass of ice water going to water', 'a glass of ice water going to water'])).toEqual([]);
    expect(wornPhrases(['a glass of ice water going warm', 'a glass of ice water going warm', 'a glass of ice water going warm'])[0]).toContain('(3 times)');
  });


  it('leaves the author\'s notes to itself out of the chapter', async () => {
    const { cleanChapter } = await import('../utils/novel/v3/author');
    expect(cleanChapter('She went in, and closed the door behind her, and said nothing at all.\n\n---\n\n*[Record: see keeper entry for chapter 1.]*')).toBe('She went in, and closed the door behind her, and said nothing at all.');
    // A bracketed line that is part of the story stays.
    expect(cleanChapter('She read the sign.\n\n[CLOSED UNTIL FURTHER NOTICE]')).toBe('She read the sign.\n\n[CLOSED UNTIL FURTHER NOTICE]');
  });
});
