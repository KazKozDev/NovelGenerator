import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import type { NovelLLM } from '../utils/novel/v2/llm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StreamingContentView from '../components/StreamingContentView';
import { deskTabs, deskFocus } from '../utils/novel/v3/deskTabs';
import { spansOf } from '../utils/novel/v3/authorDesk';
import { deskBudget, deskView, newDesk, ownWords, readStep, readSteps, takeStep } from '../utils/novel/v3/authorDesk';

const input = { premise: 'Nora hides a notebook.', author_requirements: 'Voice: third-limited. Audience: adult.', genre: 'thriller', chapter_count: 2, target_total_words: 600, planning_version: 2 as const };
const step = (thought: string, tool: string, target: string, content = '') => `THOUGHT: ${thought}\nTOOL: ${tool}\n${tool === 'ask_character' ? 'NAME' : 'FILE'}: ${target}\n---\n${content}`;

/** An author that does what the script says, one answer per step, and a second mind that answers when asked. */
const scripted = (script: string[], seen: { stage: string; prompt: string; system: string }[] = []): NovelLLM => async (prompt, system, options) => {
  const stage = options?.stage || ''; seen.push({ stage, prompt, system });
  if (stage === 'author-step') return script.shift() ?? 'THOUGHT: Finished.\nTOOL: done\n---\n';
  if (stage === 'author-character') return 'I would burn it before I let him read it.';
  if (stage === 'author-reader') return 'I would turn the page. The drawer bothered me: it was locked and then it was open.';
  throw new Error(`Unexpected stage ${stage}`);
};

const author_journal = (store: MemoryProjectStore) => store.loadAuthor()!.desk!.journal.join('\n');

describe('the author at its desk', () => {
  it('is how a new book is written, and does what it decides to do: thinks, asks a character, writes, asks a reader, goes back, says it is done', async () => {
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    const result = await new Orchestrator(store).runBook(input, scripted([
      step('I think first.', 'write', 'notebook.md', 'The ending: she burns it.'),
      step('I need her from inside.', 'ask_character', 'Nora', 'You have a notebook he must not read. What do you do?'),
      step('Chapter one.', 'write', 'chapter-1.md', '# Chapter One\n\nShe locked the drawer and went to bed.'),
      step('A stranger should read it.', 'ask_reader', 'chapter-1.md', ''),
      step('The reader is right about the drawer.', 'write', 'chapter-1.md', 'She left the drawer open and went to bed.'),
      step('Chapter two.', 'write', 'chapter-2.md', 'In the morning the notebook was ash.'),
    ], seen));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(seen.map(call => call.stage)).toEqual(['author-step', 'author-step', 'author-character', 'author-step', 'author-reader', 'author-step', 'author-reader', 'author-step', 'author-step', 'author-step']);
    // With every chapter but the last written, a reader said what they were holding: once, and before the ending existed.
    expect(seen[4].prompt).toContain('a novel up to its last chapter, which you have not read yet'); expect(seen[4].prompt).toContain('She locked the drawer'); expect(seen[4].prompt).not.toContain('ash');
    expect(seen[5].prompt).toContain('Every chapter but the last now has text. Someone has read the book up to here, and says what they are holding as they turn to the ending:');
    expect(author_journal(store)).toContain('the book was written up to its last chapter, and a reader said what they were holding');
    expect(store.manuscript()).toEqual([{ chapter: 1, text: 'She left the drawer open and went to bed.' }, { chapter: 2, text: 'In the morning the notebook was ash.' }]);
    const author = store.loadAuthor()!;
    expect(author.notebook).toBe('The ending: she burns it.'); expect(author.completed).toBe(true);
    expect(author.desk!.journal[1]).toContain('asked Nora — I need her from inside.');
    // Nothing told it the order: the system prompt names tools and a budget, not steps.
    expect(seen[0].system).toContain('Nobody will tell you how to work');
    expect(seen[0].system).not.toMatch(/first write|before any chapter|you must/i);
    // What it was told stays on its desk, and says when the text has changed under it.
    expect(seen[3].prompt).toContain('Nora answers:\nI would burn it before I let him read it.');
    expect(seen[8].prompt).toContain('[a reader, at step 4, about chapter-1.md — YOU HAVE CHANGED chapter-1.md SINCE');
    expect(seen[8].prompt).toContain('[Nora, at step 2]');
  });

  it('is told when the book is not all there, and is stopped by its budget, not by a rule', async () => {
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    const early = await new Orchestrator(store).runBook(input, scripted([step('Enough.', 'done', ''), step('One.', 'write', 'chapter-1.md', 'One.'), step('Two.', 'write', 'chapter-2.md', 'Two.')], seen));
    expect(early.status).toBe('COMPLETE');
    expect(seen[1].prompt).toContain('The book is not finished: chapter-1.md, chapter-2.md have no text.');

    const idle = new MemoryProjectStore(); let steps = 0;
    const result = await new Orchestrator(idle).runBook(input, async () => { steps++; return step('Still thinking.', 'append', 'notebook.md', 'More.'); });
    expect(steps).toBe(deskBudget(2));
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(idle.loadReport()!.findings.map(finding => finding.description)).toEqual(['chapter-1.md was not written before the budget ran out.', 'chapter-2.md was not written before the budget ran out.']);
  });

  it('may go back to any chapter of a whole book, and is not ended for it', async () => {
    const store = new MemoryProjectStore();
    const result = await new Orchestrator(store).runBook(input, scripted([step('One.', 'write', 'chapter-1.md', 'One.'), step('Two.', 'write', 'chapter-2.md', 'She left by the side door.'),
      step('One again.', 'write', 'chapter-1.md', 'One, with the drawer.'), step('And a thing.', 'plant', 'chapter-2.md', 'She left by the side door.\n===\nA key lay on the sill.')]));
    const desk = store.loadAuthor()!.desk!;
    expect(desk.files['chapter-1.md']).toBe('One, with the drawer.'); expect(desk.files['chapter-2.md']).toContain('A key lay on the sill.');
    expect(desk.finished).toBe(true); expect(result.status).not.toBe('FAILED');
    expect(author_journal(store)).not.toContain('typesetter');
  });
  it('goes on from the step it stopped at', async () => {
    const store = new MemoryProjectStore(); let calls = 0;
    const stopped = await new Orchestrator(store).runBook(input, async (prompt, system, options) => { if (options?.stage === 'author-step' && ++calls === 3) throw new Error('The connection dropped'); return scripted([calls === 1 ? step('Notes.', 'write', 'notebook.md', 'Notes.') : step('One.', 'write', 'chapter-1.md', 'One.')])(prompt, system, options); });
    expect(stopped.status).toBe('FAILED');
    expect(store.loadAuthor()!.desk!.files['chapter-1.md']).toBe('One.');
    const seen: { stage: string; prompt: string; system: string }[] = [];
    const resumed = await new Orchestrator(store).runBook(input, scripted([step('Two.', 'write', 'chapter-2.md', 'Two.')], seen));
    expect(resumed.status, resumed.stoppedReason || '').toBe('COMPLETE');
    expect(seen[0].prompt).toContain('===== chapter-1.md (1 words) =====\nOne.');
    expect(store.manuscript().map(item => item.text)).toEqual(['One.', 'Two.']);
  });
});

describe('who reads the book', () => {
  it('is another model than the author when one is set, while characters stay in the author\'s own; a reader who refuses does not stop the book', async () => {
    const routes: string[] = []; let refuse = false;
    const llm: NovelLLM = async (prompt, system, options) => {
      routes.push(`${options?.stage}:${options?.route}`);
      if (options?.stage === 'author-reader' && options.route === 'validator' && refuse) throw new Error('data_inspection_failed');
      return scripted(script)(prompt, system, options);
    };
    const script = [step('Her.', 'ask_character', 'Nora', 'What do you do?'), step('One.', 'write', 'chapter-1.md', 'One.'), step('Read it.', 'ask_reader', 'chapter-1.md', ''), step('Two.', 'write', 'chapter-2.md', 'Two.')];
    const store = new MemoryProjectStore();
    expect((await new Orchestrator(store).runBook(input, llm)).status).toBe('COMPLETE');
    expect(routes.filter(route => route.startsWith('author-step')).every(route => route === 'author-step:writer')).toBe(true);
    expect(routes).toContain('author-character:writer'); expect(routes).not.toContain('author-character:validator');
    expect(routes.filter(route => route.startsWith('author-reader'))).toEqual(['author-reader:validator', 'author-reader:validator']);

    routes.length = 0; refuse = true; script.push(step('One.', 'write', 'chapter-1.md', 'One.'), step('Read it.', 'ask_reader', 'chapter-1.md', ''), step('Two.', 'write', 'chapter-2.md', 'Two.'));
    const second = new MemoryProjectStore();
    expect((await new Orchestrator(second).runBook({ ...input, premise: 'Nora hides a second notebook.' }, llm)).status).toBe('COMPLETE');
    expect(routes.filter(route => route.startsWith('author-reader')).slice(0, 2)).toEqual(['author-reader:validator', 'author-reader:writer']);
    expect(second.loadAuthor()!.desk!.journal.join('\n')).toContain('the other reader could not read it (data_inspection_failed)');
  });
});

describe('the desk', () => {
  it('shows the author its own steps when it comes round to a chapter a third time, and stops nothing', async () => {
    const desk = newDesk(2); desk.told_promises = true; desk.budget = 30;
    const ask = async () => { desk.spent++; return 'DOES NOT ADD UP: the drawer was locked and then open.'; };
    const write = (text: string) => { desk.step++; return takeStep(desk, readStep(step('The reader is right about the drawer.', 'write', 'chapter-1.md', text)), 2, ask); };
    expect(await write('She locked the drawer.')).not.toContain('come round');
    desk.step++; await takeStep(desk, readStep(step('Read it.', 'ask_reader', 'chapter-1.md', '')), 2, ask);
    expect(await write('She locked the drawer and kept the key.')).not.toContain('come round');
    const third = await write('She locked the drawer, kept the key and told no one at all.');
    expect(third).toContain('You have come round to chapter-1.md again: this is time number 3');
    expect(third).toContain('1. wrote chapter-1.md (4 words) — The reader is right about the drawer.'); expect(third).toContain('a reader said: DOES NOT ADD UP');
    expect(third).toContain('Its length went 4 → 8 → 13 words.'); expect(third).toContain('chapter-2.md is not written yet'); expect(third).toContain('yours to decide');
    // Nothing was stopped: the chapter is what it wrote, and it may write it again.
    expect(desk.files['chapter-1.md']).toBe('She locked the drawer, kept the key and told no one at all.');
    expect(await write('She burned the drawer.')).toContain('time number 4'); expect(desk.files['chapter-1.md']).toBe('She burned the drawer.');
  });
  it('is told when a chapter it wrote again came out as it was, or which few paragraphs changed', async () => {
    const desk = newDesk(2); desk.told_promises = true; const ask = async () => 'fine';
    const text = Array.from({ length: 8 }, (_, at) => `Paragraph ${at + 1} of the chapter, about the drawer.`).join('\n\n');
    const write = (content: string) => takeStep(desk, readStep(step('Fix the one line.', 'write', 'chapter-1.md', content)), 2, ask);
    expect(await write(text)).not.toContain('nothing in it changed');
    expect(await write(text)).toContain('paragraph for paragraph, what was already in chapter-1.md: nothing in it changed');
    const told = await write(text.replace('Paragraph 3 of', 'The third part of'));
    expect(told).toContain('Of its 8 paragraphs, 1 differ'); expect(told).toContain('"The third part of the chapter');
  });
  it('is told when it asks the keeper what it has asked before, with what it was told then', async () => {
    const desk = newDesk(2); desk.files['chapter-1.md'] = 'He died in the room on Thursday.'; desk.budget = 30;
    const ask = async () => { desk.spent++; return 'The text does not say how he died.'; };
    const keeper = (question: string) => { desk.step++; return takeStep(desk, readStep(`THOUGHT: Check.\nTOOL: ask_keeper\nFILE: chapter-1.md\n---\n${question}`), 2, ask); };
    expect(await keeper('Does the book ever tell the reader how Adam Vance died in the hotel room?')).not.toContain('much the same before');
    expect(await keeper('What colour is the door of the office on Wentworth Street?')).not.toContain('much the same before');
    const again = await keeper('Does the book, as written, ever tell the reader how Adam Vance actually died in that hotel room?');
    expect(again).toContain('You have asked the keeper much the same before'); expect(again).toContain('1. you asked: Does the book ever tell the reader how Adam Vance died');
    expect(again).toContain('and were told: The text does not say how he died.'); expect(again).toContain('yours to decide');
  });
  it('hands back the ages and spans of time a chapter names, beside those the earlier chapters named', async () => {
    expect(spansOf('He found her when she was sixteen. Twenty-five years of it. Bernadette was ninety-one years old; it had been a year.')).toEqual(['was sixteen', 'twenty-five years', 'ninety-one years old', 'a year']);
    // An hour is not an age, and a day is not a span worth naming.
    expect(spansOf('At 23:00 he was alert. She came at eleven at night, one day in March, and was eleven minutes late.')).toEqual([]);
    const desk = newDesk(2); desk.told_promises = true; desk.files['chapter-1.md'] = 'He took her in when she was sixteen, twenty-five years ago.';
    const told = await takeStep(desk, readStep(step('Two.', 'write', 'chapter-2.md', 'It was the winter she was nineteen. She had said it for twenty-two years.')), 2, async () => '');
    expect(told).toContain('Ages and spans of time it names: was nineteen, twenty-two years. Earlier chapters named — chapter-1.md: was sixteen, twenty-five years ago.');
  });
  it('writes one chapter to an answer: what follows a chapter in the same answer waits until its result is seen', async () => {
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    const three = { ...input, chapter_count: 3, target_total_words: 900 };
    const batch = [step('Notes.', 'write', 'notebook.md', 'She burns it.'), step('One.', 'write', 'chapter-1.md', 'One.'), step('Two.', 'write', 'chapter-2.md', 'Written blind.'), step('Three.', 'write', 'chapter-3.md', 'Written blind.')].join('\n\n');
    await new Orchestrator(store).runBook(three, scripted([batch, step('Two.', 'write', 'chapter-2.md', 'Two.'), step('Three.', 'write', 'chapter-3.md', 'Three.')], seen));
    // Notes before a chapter share its answer; the chapters after it were not carried out.
    expect(store.loadAuthor()!.desk!.files['notebook.md']).toBe('She burns it.');
    const next = seen.filter(call => call.stage === 'author-step')[1].prompt;
    expect(next).toContain('A chapter is the last step of an answer: the 2 step(s) you wrote after chapter-1.md were not carried out');
    expect(next).toContain('Not yet written: chapter-2.md, chapter-3.md.');
    expect(store.manuscript().map(item => item.text)).toEqual(['One.', 'Two.', 'Three.']);
    expect(seen[0].system).toContain('one chapter to an answer');
  });
  it('sets a thing into a chapter without forbidding a second; a reader asked afterwards is a new reader, at the next price', async () => {
    const state = newDesk(2); state.told_promises = true; state.files['chapter-1.md'] = 'She came in from the rain.\n\nShe sat down.'; let readers = 0;
    const ask = async (kind: string) => { state.spent++; if (kind === 'reader') readers++; return `Reader ${readers}.`; };
    const plant = (what: string) => takeStep(state, readStep(`THOUGHT: Set it in.\nTOOL: plant\nFILE: chapter-1.md\n---\nShe came in from the rain.\n===\n${what}`), 2, ask);
    const read = () => takeStep(state, readStep(step('Read.', 'ask_reader', 'chapter-1.md', '')), 2, ask);
    expect(await read()).toContain('Reader 1.');
    expect(await plant('A phone lay face down on the sill.')).toContain('Set into chapter-1.md');
    expect(await plant('It was his.')).toContain('Set into chapter-1.md');
    // The text is not what the first reader read: nobody is told that nothing has changed. The second reader of a chapter costs three calls.
    const spent = state.spent; expect(await read()).toContain('Reader 2.'); expect(readers).toBe(2); expect(state.spent - spent).toBe(3);
  });
  it('hears once, as it turns to the last chapter, what a reader of the book so far is holding', async () => {
    const state = newDesk(3); state.files['chapter-1.md'] = 'A gun on the wall.';
    let asked = 0, read = ''; const ask = async (kind: string, prompt: string) => { asked++; state.spent++; read = prompt; return 'The gun in chapter one has not been fired.'; };
    const first = await takeStep(state, readStep(step('Two.', 'write', 'chapter-2.md', 'They had tea.')), 3, ask);
    expect(first).toContain('Every chapter but the last now has text.'); expect(first).toContain('The gun in chapter one has not been fired.'); expect(first).toContain('That cost one call');
    expect(read).toContain('A gun on the wall.'); expect(read).toContain('up to its last chapter, which you have not read yet');
    // Once: neither writing the ending nor saying done brings another, and done is simply done.
    expect(await takeStep(state, readStep(step('Three.', 'write', 'chapter-3.md', 'The gun went off.')), 3, ask)).not.toContain('Someone has read');
    expect(await takeStep(state, readStep('THOUGHT: Done.\nTOOL: done'), 3, ask)).toBe(''); expect(state.finished).toBe(true); expect(asked).toBe(1);
    // With no call left to pay for a reader, nobody reads.
    const broke = newDesk(2); broke.spent = broke.budget - 1;
    expect(await takeStep(broke, readStep(step('One.', 'write', 'chapter-1.md', 'One.')), 2, ask)).not.toContain('Someone has read'); expect(asked).toBe(1);
  });
  it('closes no chapter: an earlier one may be written again after the next is begun, and a whole book may still be planted in', async () => {
    const desk = newDesk(2); desk.told_promises = true; const ask = async () => 'fine';
    await takeStep(desk, readStep(step('One.', 'write', 'chapter-1.md', 'She came in from the rain.')), 2, ask);
    await takeStep(desk, readStep(step('Two.', 'write', 'chapter-2.md', 'She left by the side door.')), 2, ask);
    expect(await takeStep(desk, readStep(step('Back.', 'write', 'chapter-1.md', 'She came in from the rain with a key.')), 2, ask)).toContain('chapter-1.md is written');
    expect(desk.files['chapter-1.md']).toBe('She came in from the rain with a key.');
    expect(await takeStep(desk, readStep('THOUGHT: Set.\nTOOL: plant\nFILE: chapter-2.md\n---\nShe left by the side door.\n===\nThe door had no lock.'), 2, ask)).toContain('Set into chapter-2.md');
    expect(await takeStep(desk, readStep(step('More.', 'append', 'chapter-2.md', 'Nobody saw her.')), 2, ask)).toContain('chapter-2.md is now');
  });
  it('reads a step however the model dresses it', () => {
    expect(readStep('**THOUGHT:** Write it.\n**TOOL:** `write`\nFILE: `chapter-1.md`\n---\nText.\n\n---\n\nMore.')).toEqual({ thought: 'Write it.', tool: 'write', file: 'chapter-1.md', name: '', content: 'Text.\n\n---\n\nMore.' });
    expect(readStep('THOUGHT: Done.\nTOOL: done').tool).toBe('done');
  });
  it('takes several steps from one answer, each to its own file, and stops at a question', async () => {
    const answer = [step('Notes first.', 'write', 'notebook.md', 'TITLE: Ash\n\nThe ending.'), step('Then who she is.', 'write', 'dossier.md', 'Nora, forty.'), step('Ask her.', 'ask_character', 'Nora', 'What do you do?'), step('Then the chapter.', 'write', 'chapter-1.md', 'Written blind.')].join('\n\n');
    expect(readSteps(answer).map(item => [item.tool, item.file || item.name])).toEqual([['write', 'notebook.md'], ['write', 'dossier.md'], ['ask_character', 'Nora'], ['write', 'chapter-1.md']]);
    expect(readSteps(answer)[0].content.trim()).toBe('TITLE: Ash\n\nThe ending.');
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    await new Orchestrator(store).runBook({ ...input, chapter_count: 1, target_total_words: 300 }, scripted([answer, step('Now, knowing her.', 'write', 'chapter-1.md', 'She burned it.')], seen));
    expect(store.loadAuthor()!.desk!.files['notebook.md']).toBe('TITLE: Ash\n\nThe ending.');
    expect(store.loadAuthor()!.title).toBe('Ash');
    // The chapter written before her answer was seen is not carried out; the next one is.
    expect(seen[2].prompt).toContain('step(s) you wrote after asking were not carried out');
    expect(store.manuscript()).toEqual([{ chapter: 1, text: 'She burned it.' }]);
  });
  it('treats an answer that was cut off as a step that did not happen', async () => {
    const store = new MemoryProjectStore(); let calls = 0; const prompts: string[] = [];
    const result = await new Orchestrator(store).runBook({ ...input, chapter_count: 1, target_total_words: 300 }, async (prompt, system, options) => { prompts.push(prompt); if (++calls === 1) throw new Error('Ollama output reached its token limit; the incomplete response was rejected.'); return scripted([step('Shorter.', 'write', 'chapter-1.md', 'One.')])(prompt, system, options); });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(prompts[1]).toContain('Your last answer was cut off before it ended');
  });
  it('keeps the desk\'s own furniture out of a file when the model goes on and imagines its next desk', async () => {
    const desk = newDesk(2);
    await takeStep(desk, readStep(step('Two.', 'write', 'chapter-1.md', 'She waited.\n---\n\n===== chapter-2.md (0 words) =====\n(empty)\n\nYOUR STEPS SO FAR:\n1. wrote\n\nBUDGET LEFT: 9 of 12 calls.')), 2, async () => '');
    expect(desk.files['chapter-1.md']).toBe('She waited.');
    expect(ownWords('Notes.\n\nRESULT OF YOUR LAST TOOL:\nx')).toBe('Notes.');
  });
  it('changes words at the one place the author quotes, and looks for the place first', async () => {
    const desk = newDesk(2); const ask = async () => '';
    desk.files['chapter-1.md'] = 'She locked the drawer. It was the only time in twelve weeks she had said it.\n\nShe went to bed.';
    desk.files['chapter-2.md'] = 'She locked the drawer again.\n\n“Eleven Thursdays,” she said — and laughed.';
    const change = (file: string, content: string) => takeStep(desk, readStep(step('Fix.', 'change', file, content)), 2, ask);
    // One place: changed there, and shown as it read and as it reads.
    const told = await change('chapter-1.md', 'twelve weeks\n===\neleven weeks');
    expect(told).toContain('Changed in chapter-1.md'); expect(told).toContain('It read: "It was the only time in twelve weeks she had said it."'); expect(told).toContain('It now reads: "It was the only time in eleven weeks she had said it."');
    expect(desk.files['chapter-1.md']).toBe('She locked the drawer. It was the only time in eleven weeks she had said it.\n\nShe went to bed.');
    // Several places: nothing changed, every place shown.
    const many = await change('', 'She locked the drawer\n===\nShe left the drawer open');
    expect(many).toContain('Nothing was changed'); expect(many).toContain('stands in 2 places'); expect(many).toContain('— PLACE 1, chapter-1.md: "She locked the drawer."'); expect(many).toContain('— PLACE 2, chapter-2.md: "She locked the drawer again."');
    expect(desk.files['chapter-2.md']).toContain('She locked the drawer again.');
    // Nowhere: nothing changed, the nearest lines shown.
    const none = await change('chapter-1.md', 'She locked the heavy drawer\n===\nShe left it');
    expect(none).toContain('does not stand in chapter-1.md'); expect(none).toContain('The lines nearest to it'); expect(none).toContain('She locked the drawer.');
    // Quotation marks and dashes need not be typed as the page has them; nothing after === takes the words out.
    expect(await change('', '"Eleven Thursdays," she said - and laughed.\n===\n')).toContain('Changed in chapter-2.md'); expect(desk.files['chapter-2.md']).toBe('She locked the drawer again.');
    expect(await change('chapter-1.md', `She went to bed\n===\n${Array.from({ length: 300 }, () => 'word').join(' ')}`)).toContain('at most 200 words');
    expect(deskTabs(desk).find(tab => tab.name === 'Set in')!.text).toContain('a line changed in chapter-1.md');
  });
  it('takes out one of two places where the same words stand, when the author says which, and says when words now stand twice', async () => {
    const desk = newDesk(2); const ask = async () => '';
    const twin = 'She had come early, it turned out, and stood a long time on the brick path looking in.';
    desk.files['chapter-1.md'] = `It rained.\n\n${twin}\n\nThe clock ticked.\n\n${twin}\n\nShe left.`;
    const told = await takeStep(desk, readStep(step('One of them.', 'change', 'chapter-1.md', `PLACE: 2\n${twin}\n===\n`)), 2, ask);
    expect(told).toContain('Changed in chapter-1.md'); expect(desk.files['chapter-1.md']).toBe(`It rained.\n\n${twin}\n\nThe clock ticked.\n\nShe left.`);
    // Setting in words that already stand in the book is done, and said.
    const again = await takeStep(desk, readStep(step('Plant.', 'plant', 'chapter-1.md', `The clock ticked\n===\n${twin}`)), 2, ask);
    expect(again).toContain('Set into chapter-1.md'); expect(again).toContain('now stands 2 times in the book (chapter-1.md)'); expect(again).toContain('PLACE: 2');
    // A long change says how much went out and in, and what now stands on either side.
    const long = Array.from({ length: 40 }, (_, at) => `word${at}`).join(' ');
    desk.files['chapter-2.md'] = `Before it all. ${long}. After it all.`;
    const big = await takeStep(desk, readStep(step('Cut.', 'change', 'chapter-2.md', `${long}.\n===\n`)), 2, ask);
    expect(big).toContain('40 words taken out, 0 put in'); expect(big).toContain('Before it now stands: "Before it all."'); expect(big).toContain('After it now stands: "After it all."');
  });
  it('shows, when asked to look for nothing in particular, what stands in the book twice', async () => {
    const desk = newDesk(2); const ask = async () => '';
    const twin = 'Claire sat on the couch with her ankles crossed and her hands folded, and said nothing for a while.';
    desk.files['chapter-1.md'] = `It rained all morning on the street.\n\n${twin}\n\nThe clock ticked on the wall above them.\n\n${twin}`; desk.files['chapter-2.md'] = 'She left by the side door and nobody saw her go.';
    const told = await takeStep(desk, readStep('THOUGHT: Which one?\nTOOL: find\n---\n'), 2, ask);
    expect(told).toContain('Standing more than once in the book, word for word'); expect(told).toContain('— 2 times (chapter-1.md), 19 words: "Claire sat on the couch'); expect(told).toContain('PLACE: 2');
    expect(await takeStep(desk, readStep('THOUGHT: And here?\nTOOL: find\nFILE: chapter-2.md\n---\n'), 2, ask)).toContain('No paragraph or long sentence stands twice in chapter-2.md');
  });
  it('carries out looks that share an answer, and not what was written after them unseen', async () => {
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    await new Orchestrator(store).runBook(input, scripted([step('One.', 'write', 'chapter-1.md', 'The key lay on the sill.'), step('Two.', 'write', 'chapter-2.md', 'Nobody had a key to that room.'),
      `${step('Where?', 'find', '', 'the key')}\n${step('And?', 'find', '', 'a key')}\n${step('Fix it.', 'change', 'chapter-1.md', 'the sill\n===\nthe floor')}`], seen));
    const desk = store.loadAuthor()!.desk!, told = seen.map(call => call.prompt.split('YOUR DESK NOW')[0]).join('\n');
    expect(told).toContain('"the key" stands in 1 place'); expect(told).toContain('"a key" stands in 1 place'); expect(told).toContain('the 1 step(s) you wrote after looking were not carried out');
    expect(desk.files['chapter-1.md']).toBe('The key lay on the sill.');
  });
  it('looks at the book as it stands after what the author has changed, and tells checking from going round', async () => {
    const desk = newDesk(2); const ask = async () => '';
    desk.files['chapter-1.md'] = 'It was the only time in twelve weeks she had said it. Twelve weeks of Thursdays lay behind her.';
    const look = () => { desk.step++; return takeStep(desk, readStep('THOUGHT: Where?\nTOOL: find\n---\ntwelve weeks'), 2, ask); };
    expect(await look()).toContain('stands in 2 places');
    desk.step++; await takeStep(desk, readStep(step('Fix.', 'change', 'chapter-1.md', 'the only time in twelve weeks\n===\nthe only time in eleven weeks')), 2, ask);
    // After a change the look shows the text as it is now, and says what is different since the last look.
    const after = await look();
    expect(after).toContain('stands in 1 place'); expect(after).toContain('Since you last looked for this, at step 1, the book has changed here: it stood in 2 places then, and stands in 1 now.');
    expect(await look()).not.toContain('You have looked for this');
    // The same sight a third time, with nothing changed between, is the same look.
    expect(await look()).toContain('You have looked for this 3 times (at steps 3, 4, 5) and it has shown the same each time');
  });
  it('says with the budget where the author is, what is left and about what it took others, as a guide', () => {
    const desk = newDesk(6); desk.step = 9; desk.spent = 13;
    for (const n of [1, 2, 3, 4]) desk.files[`chapter-${n}.md`] = 'Text.'; desk.files['notebook.md'] = 'Notes.';
    desk.journal = ['2. wrote chapter-1.md (900 words)', '3. a reader read through chapter-1.md', '4. wrote chapter-2.md (900 words)', '5. asked the keeper: where is the key', '6. wrote chapter-3.md (900 words)', '7. planted in chapter-1.md', '8. wrote chapter-3.md (950 words)', '9. wrote chapter-4.md (900 words)'];
    const view = deskView(desk, 6, '');
    expect(view).toContain('BUDGET LEFT: 11 of 24 calls.');
    expect(view).toContain('WHERE YOU ARE: 4 of 6 chapters written (chapter-5.md, chapter-6.md to go). So far: 9 answers; asked a reader once, the keeper once; 1 set in; written more than once: chapter-3.md (2).');
    expect(view).toContain('a guide, not a rule'); expect(view).toContain('the 2 chapters still to write took other authors about 4 calls'); expect(view).toContain('You have 11: room for all of that and 1 over.');
    for (const n of [5, 6]) desk.files[`chapter-${n}.md`] = 'Text.'; desk.spent = 22;
    expect(deskView(desk, 6, '')).toContain('the book is whole. Other authors spent about 6 calls from here'); expect(deskView(desk, 6, '')).toContain('You have 2: about enough for one last thing and to say done.');
    desk.files['chapter-6.md'] = ''; desk.files['chapter-5.md'] = ''; desk.spent = 23;
    expect(deskView(desk, 6, '')).toContain('You have 1, which is fewer than the chapters still to write.');
  });
  it('sets a thing in after the paragraph the author quotes, wherever in it the words stand', async () => {
    const desk = newDesk(2); const ask = async () => '';
    desk.files['chapter-1.md'] = 'She locked the drawer and stood a moment.\n\nShe went to bed.'; desk.files['chapter-2.md'] = 'She went to bed early.';
    const plant = (file: string, content: string) => takeStep(desk, readStep(step('Plant.', 'plant', file, content)), 2, ask);
    expect(await plant('chapter-1.md', 'stood a moment\n===\nThe key went into the blue jar on the sill.')).toContain('Set into chapter-1.md after "She locked the drawer');
    expect(desk.files['chapter-1.md']).toBe('She locked the drawer and stood a moment.\n\nThe key went into the blue jar on the sill.\n\nShe went to bed.');
    expect(await plant('', 'She went to bed\n===\nA line.')).toContain('stands in 2 places');
    expect(await plant('chapter-1.md', `She locked the drawer\n===\n${Array.from({ length: 200 }, () => 'word').join(' ')}`)).toContain('at most 120 words');
    expect(await plant('chapter-1.md', 'A paragraph that is not there at all\n===\nA line.')).toContain('does not stand in chapter-1.md');
  });
  it('looks without touching, exactly, and looking costs no call', async () => {
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    await new Orchestrator(store).runBook(input, scripted([step('One.', 'write', 'chapter-1.md', 'The key lay on the sill. She took the key.'), step('Two.', 'write', 'chapter-2.md', 'Nobody had a key to that room.'),
      step('Where is it?', 'find', '', 'the key'), step('And this?', 'find', 'chapter-2.md', 'a brass lamp')], seen));
    const desk = store.loadAuthor()!.desk!;
    const told = seen.map(call => call.prompt.split('YOUR DESK NOW')[0]).join('\n');
    expect(told).toContain('"the key" stands in 2 places'); expect(told).toContain('— chapter-1.md: "The key lay on the sill."'); expect(told).toContain('— chapter-1.md: "She took the key."');
    expect(told).toContain('"a brass lamp" does not stand in chapter-2.md');
    // Two answers only looked and cost nothing; the reader who spoke unasked before the last chapter cost one.
    expect(desk.free_looks).toBe(2); expect(desk.spent).toBe(desk.step - 2 + 1);
    expect(desk.files['chapter-1.md']).toBe('The key lay on the sill. She took the key.');
  });
  it('gives the same answer, free, when a reader is asked again about text they have read, and charges more for each new reader of a chapter', async () => {
    const desk = newDesk(2); desk.files['chapter-1.md'] = 'She locked the drawer.'; desk.told_promises = true; let asked = 0;
    const ask = async () => { asked++; desk.spent++; return `Reader ${asked}: I would turn the page.`; };
    const read = () => takeStep(desk, readStep(step('Read it.', 'ask_reader', 'chapter-1.md', '')), 2, ask);
    expect(await read()).toContain('Reader 1'); expect(desk.spent).toBe(1);
    expect(await read()).toContain('has already read the book through chapter-1.md as it now stands'); expect(asked).toBe(1); expect(desk.spent).toBe(1);
    await takeStep(desk, readStep(step('Again.', 'write', 'chapter-1.md', 'She left the drawer open.')), 2, ask);
    expect(await read()).toContain('Reader 2'); expect(desk.spent).toBe(4);
    // A third reader of the chapter, after another rewrite, is dearer still.
    await takeStep(desk, readStep(step('Again.', 'write', 'chapter-1.md', 'She burned the drawer.')), 2, ask);
    expect(await read()).toContain('Reader 3'); expect(desk.spent).toBe(9);
  });
  it('hands back with a written chapter what code can count: worn phrases, and the days and hours it names beside the earlier ones', async () => {
    const desk = newDesk(2); const refrain = 'She looked at the middle distance and said nothing at all.';
    desk.files['chapter-1.md'] = `On Thursday the fourth of March, at 9:40, she came. ${refrain} ${refrain}`;
    const told = await takeStep(desk, readStep(step('Two.', 'write', 'chapter-2.md', `On Friday she left at 8:15. ${refrain} And then she`)), 2, async () => '');
    expect(told).toContain('It stops in the middle of a sentence.');
    expect(told).toContain('Days, dates and hours it names: Friday, 8:15.');
    expect(told).toContain('Earlier chapters named — chapter-1.md: Thursday');
    expect(told).toContain('"she looked at the middle distance and said nothing at all" (3 times)');
  });
  it('lets the author ask what the book already says, from the page', async () => {
    const desk = newDesk(1); desk.files['chapter-1.md'] = 'The key went into the blue jar.'; let seen = '';
    const told = await takeStep(desk, readStep(step('Where is it?', 'ask_keeper', '', 'Where is the key at the end of chapter one?')), 1, async (_kind, prompt) => { seen = prompt; return 'In the blue jar (chapter-1.md: "The key went into the blue jar.").'; });
    expect(seen).toContain('[chapter-1.md]\nThe key went into the blue jar.'); expect(seen).toContain('QUESTION: Where is the key');
    expect(told).toContain('The keeper says:\nIn the blue jar');
  });
  it('shows the whole desk, the budget and what is not yet written', () => {
    const desk = newDesk(2); desk.files['notebook.md'] = 'Thinking.'; desk.spent = 5;
    const view = deskView(desk, 2, 'notebook.md is written: 1 words.');
    expect(view).toContain('RESULT OF YOUR LAST TOOL:\nnotebook.md is written: 1 words.');
    expect(view).toContain('===== notebook.md (1 words) =====\nThinking.');
    expect(view).toContain(`BUDGET LEFT: ${deskBudget(2) - 5} of ${deskBudget(2)} calls. Not yet written: chapter-1.md, chapter-2.md.`);
  });
});

describe('the tabs of the author\'s tools', () => {
  it('show the words that passed through each tool: what the author asked and what it was told', async () => {
    const state = newDesk(2); state.told_promises = true;
    state.files['notebook.md'] = 'She burns it.'; state.files['chapter-1.md'] = 'She came in from the rain.\n\nShe sat down.';
    const ask = async (kind: string, prompt: string) => prompt.includes('keeper') || prompt.includes('Quote') ? 'It says Tuesday: "On Tuesday she came."' : kind === 'reader' ? 'WAITING FOR: the drawer.' : 'I would burn it.';
    await takeStep(state, readStep(step('Her.', 'ask_character', 'Nora', 'What do you do with the notebook?')), 2, ask);
    await takeStep(state, readStep(step('Read.', 'ask_reader', 'chapter-1.md', 'Does the drawer land?')), 2, ask);
    await takeStep(state, readStep('THOUGHT: Day.\nTOOL: ask_keeper\nFILE: chapter-1.md\n---\nQuote the day she came.'), 2, ask);
    await takeStep(state, readStep('THOUGHT: Set.\nTOOL: plant\nFILE: chapter-1.md\n---\nShe came in from the rain.\n===\nA phone lay on the sill.'), 2, ask);
    const tabs = Object.fromEntries(deskTabs(state).map(tab => [tab.name, tab]));
    expect(Object.keys(tabs)).toEqual(['Reader', 'Characters', 'Keeper', 'Set in', 'Notebook']);
    expect(tabs.Characters.text).toContain('the author to Nora'); expect(tabs.Characters.text).toContain('> What do you do with the notebook?'); expect(tabs.Characters.text).toContain('I would burn it.');
    expect(tabs.Reader.text).toContain('> Does the drawer land?'); expect(tabs.Reader.text).toContain('WAITING FOR: the drawer.'); expect(tabs.Reader.count).toBe(1);
    expect(tabs.Keeper.text).toContain('> Quote the day she came.'); expect(tabs.Keeper.text).toContain('It says Tuesday'); expect(tabs.Keeper.text).not.toContain('Q: ');
    expect(tabs['Set in'].text).toContain('A phone lay on the sill.'); expect(tabs['Set in'].text).toContain('> She came in from the rain.');
    expect(tabs.Notebook.text).toContain('She burns it.');
    // Beside the views of the chapter, apart from them; a tool with nothing in it still has its tab.
    const html = renderToStaticMarkup(<StreamingContentView title="Chapter 1" content="Text." tools={deskTabs(newDesk(1))} />);
    expect(html).toContain('data-testid="tool-tabs"'); expect(html.indexOf('Reader')).toBeLessThan(html.indexOf('Changes')); expect(html).toContain('Characters');
    expect(renderToStaticMarkup(<StreamingContentView title="Chapter 1" content="Text." />)).not.toContain('tool-tabs');
  });
});

describe('the screen following the author', () => {
  it('knows from the answer as it arrives where the author is working, and when it has gone back to a chapter', () => {
    expect(deskFocus('author-step', 'THOUGHT: I think first.', null)).toBeUndefined();
    expect(deskFocus('author-step', 'THOUGHT: Notes.\nTOOL: write\nFILE: notebook.md\n---\nThe ending: she', null)).toEqual({ tab: 'Notebook', label: 'The author is writing in notebook.md', text: 'The ending: she' });
    expect(deskFocus('author-step', 'THOUGHT: Plan.\nTOOL: write\nFILE: plan.md\n---\nOne.', 'Notebook')!.tab).toBe('Notebook');
    expect(deskFocus('author-step', 'THOUGHT: Her.\nTOOL: ask_character\nNAME: Nora\n---\nWhat do you', null)).toEqual({ tab: 'Characters', label: 'The author is asking Nora', text: 'What do you' });
    expect(deskFocus('author-step', 'THOUGHT: Day.\nTOOL: ask_keeper\nFILE: chapter-1.md\n---\nQuote the day', null)!.tab).toBe('Keeper');
    expect(deskFocus('author-step', 'THOUGHT: Read.\nTOOL: ask_reader\nFILE: chapter-1.md\n---\n', null)!.tab).toBe('Reader');
    expect(deskFocus('author-step', '**THOUGHT:** Sow.\n**TOOL:** `plant`\n**FILE:** `chapter-1.md`\n---\nShe came', null)!.tab).toBe('Set in');
    // A chapter takes the screen back to the chapter; of several steps in one answer, the one arriving counts.
    expect(deskFocus('author-step', 'THOUGHT: Notes.\nTOOL: write\nFILE: notebook.md\n---\nNotes.\n\nTHOUGHT: One.\nTOOL: write\nFILE: chapter-1.md\n---\nShe', 'Notebook')).toEqual({ tab: null, label: '', text: '' });
    // The one who answers is shown where the question was put.
    expect(deskFocus('author-reader', 'WAITING FOR:', 'Notebook')).toEqual({ tab: 'Reader', label: 'A reader is answering', text: 'WAITING FOR:' });
    expect(deskFocus('author-character', 'I would', 'Characters')!.tab).toBe('Characters'); expect(deskFocus('author-character', 'It says', 'Keeper')!.tab).toBe('Keeper');
    expect(deskFocus('thesis-block-write', 'x', null)).toBeUndefined();
  });
  it('shows under a tool\'s own text what is being written there now', () => {
    const tools = [{ name: 'Reader', count: 1, text: 'What was said before.' }];
    const html = renderToStaticMarkup(<StreamingContentView title="Chapter 1" content="Text." tools={tools} toolFocus={{ tab: 'Reader', label: 'A reader is answering', text: 'WAITING FOR: the drawer' }} />);
    // Static markup is the first paint, before the pane has turned to the tab: the tab is there to be turned to.
    expect(html).toContain('Reader'); expect(html).toContain('Text.');
  });
});
