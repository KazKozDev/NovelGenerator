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
    expect(seen.map(call => call.stage).filter(stage => stage !== 'author-objects' && stage !== 'author-label')).toEqual(['author-step', 'author-step', 'author-character', 'author-step', 'author-reader', 'author-step', 'author-reader', 'author-step', 'author-step', 'author-step']);
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

  it('ends a whole book whose author keeps asking to change what is closed', async () => {
    const store = new MemoryProjectStore(); const seen: { stage: string; prompt: string; system: string }[] = [];
    await new Orchestrator(store).runBook(input, scripted([
      step('One.', 'write', 'chapter-1.md', 'One.'), step('Two.', 'write', 'chapter-2.md', 'Two.'),
      step('Back.', 'write', 'chapter-1.md', 'One, again.'), step('Back.', 'write', 'chapter-1.md', 'One, once more.'),
      step('Never reached.', 'write', 'notebook.md', 'More notes.'),
    ], seen));
    expect(store.manuscript().map(item => item.text)).toEqual(['One.', 'Two.']);
    expect(seen.filter(call => call.stage === 'author-step')).toHaveLength(4);
    expect(author_journal(store)).toContain('nothing more can be changed: the book is done');
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
  it('lets a chapter be written again whole, once, and after that it stands', async () => {
    let state = newDesk(2); state.told_promises = true; const ask = async () => '';
    const write = (file: string, text: string) => takeStep(state, readStep(step('Write.', 'write', file, text)), 2, ask);
    await write('chapter-1.md', 'One.'); await write('chapter-2.md', 'The ending.');
    expect(await write('chapter-2.md', 'The ending, written again.')).toContain('chapter-2.md is written');
    // The limit is kept across a saved desk, and append is not a way round it.
    state = JSON.parse(JSON.stringify(state));
    expect(await write('chapter-2.md', 'A third ending.')).toContain('has been written again once already'); expect(await write('chapter-2.md', 'A fourth.')).toContain('say done');
    expect(await takeStep(state, readStep(step('More.', 'append', 'chapter-2.md', 'And an afterword.')), 2, ask)).toContain('there is nothing to finish');
    expect(state.files['chapter-2.md']).toBe('The ending, written again.');
    // A chapter cut off in the middle of a sentence can be finished.
    const cut = newDesk(2); cut.told_promises = true;
    await takeStep(cut, readStep(step('One.', 'write', 'chapter-1.md', 'She opened the drawer and')), 2, ask);
    expect(await takeStep(cut, readStep(step('Finish.', 'append', 'chapter-1.md', 'found it empty.')), 2, ask)).toContain('chapter-1.md is now');
    // A desk saved before the limit existed is counted from its journal.
    const old = newDesk(1); old.told_promises = true; old.files['chapter-1.md'] = 'Second.'; old.journal = ['1. wrote chapter-1.md (1 words)', '2. wrote chapter-1.md (1 words)'];
    expect(await takeStep(old, readStep(step('Third.', 'write', 'chapter-1.md', 'Third.')), 1, ask)).toContain('has been written again once already');
  });
  it('plants for a chapter still to be written, and not into a book that is whole', async () => {
    const state = newDesk(2); state.told_promises = true; state.files['chapter-1.md'] = 'She came in from the rain.\n\nShe sat down.'; const ask = async () => '';
    const plant = () => takeStep(state, readStep('THOUGHT: Sow it.\nTOOL: plant\nFILE: chapter-1.md\n---\nShe came in from the rain.\n===\nA phone lay on the sill.'), 2, ask);
    expect(await plant()).toContain('Set into chapter-1.md');
    await takeStep(state, readStep(step('Two.', 'write', 'chapter-2.md', 'Two.')), 2, ask);
    const before = state.files['chapter-1.md'];
    expect(await plant()).toContain('there is no later chapter to plant for. To change chapter-1.md, write it again whole.');
    expect(state.files['chapter-1.md']).toBe(before);
    // Writing the last chapter again whole is still there.
    expect(await takeStep(state, readStep(step('Again.', 'write', 'chapter-2.md', 'Two, again.')), 2, ask)).toContain('chapter-2.md is written');
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
  it('sets a thing into a chapter without forbidding a second, and a plant buys no new reader', async () => {
    const state = newDesk(2); state.told_promises = true; state.files['chapter-1.md'] = 'She came in from the rain.\n\nShe sat down.'; let readers = 0;
    const ask = async (kind: string) => { state.spent++; if (kind === 'reader') readers++; return `Reader ${readers}.`; };
    const plant = (what: string) => takeStep(state, readStep(`THOUGHT: Set it in.\nTOOL: plant\nFILE: chapter-1.md\n---\nShe came in from the rain.\n===\n${what}`), 2, ask);
    const read = () => takeStep(state, readStep(step('Read.', 'ask_reader', 'chapter-1.md', '')), 2, ask);
    expect(await read()).toContain('Reader 1.');
    expect(await plant('A phone lay face down on the sill.')).toContain('Set into chapter-1.md');
    expect(await plant('It was his.')).toContain('Set into chapter-1.md');
    // One thing set down in passing is not a new chapter: the reader who read it has nothing new to say, and says so for nothing.
    expect(await read()).toContain('has already read the book through chapter-1.md'); expect(readers).toBe(1);
  });
  it('hears once, as it turns to the last chapter, what a reader of the book so far is holding', async () => {
    const state = newDesk(3); state.files['chapter-1.md'] = 'A gun on the wall.';
    let asked = 0, read = ''; const ask = async (kind: string, prompt: string) => { if (kind === 'objects' || kind === 'helper') throw new Error('no small network here'); asked++; state.spent++; read = prompt; return 'The gun in chapter one has not been fired.'; };
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
  it('moves forward: a chapter is open while it is the last one written, and closes when the next is begun', async () => {
    const state = newDesk(3); state.told_promises = true; const ask = async () => '';
    const write = (file: string, text: string) => takeStep(state, readStep(step('Write.', 'write', file, text)), 3, ask);
    await write('chapter-1.md', 'She came in from the rain.');
    expect(await write('chapter-1.md', 'She came in out of the rain.')).toContain('chapter-1.md is written');
    await write('chapter-2.md', 'Two.');
    const closed = await write('chapter-1.md', 'A different first chapter.');
    expect(closed).toContain('chapter-1.md went to the typesetter when you began chapter-2.md'); expect(closed).toContain('can be answered in chapter-3.md');
    expect(state.files['chapter-1.md']).toBe('She came in out of the rain.');
    expect(await takeStep(state, readStep(step('More.', 'append', 'chapter-1.md', 'And more.')), 3, ask)).toContain('went to the typesetter');
    // A plant still sows into a closed chapter for one not yet written.
    expect(await takeStep(state, readStep('THOUGHT: Sow.\nTOOL: plant\nFILE: chapter-1.md\n---\nShe came in out of the rain.\n===\nA phone lay on the sill.'), 3, ask)).toContain('Set into chapter-1.md');
    await write('chapter-3.md', 'Three.');
    // In a whole book only the last chapter is open.
    expect(await write('chapter-2.md', 'Two, again.')).toContain('The one chapter still open is chapter-3.md, the last.');
    expect(await write('chapter-3.md', 'Three, again.')).toContain('chapter-3.md is written');
    expect(state.journal.join('\n')).toContain('write chapter-1.md: it went to the typesetter when chapter-2.md was begun');
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
  it('has no tool for patching a passage: a chapter is written again, or one thing is set into it', async () => {
    const desk = newDesk(2); desk.files['chapter-1.md'] = 'She locked the drawer.\n\nShe went to bed.';
    expect(await takeStep(desk, readStep(step('Fix.', 'edit', 'chapter-1.md', 'She locked\n===\nShe left')), 2, async () => '')).toContain('There is no tool for patching a passage');
    expect(desk.files['chapter-1.md']).toBe('She locked the drawer.\n\nShe went to bed.');
    expect(await takeStep(desk, readStep(step('Plant the key.', 'plant', 'chapter-1.md', 'She locked the drawer\n===\nThe key went into the blue jar on the sill.')), 2, async () => '')).toContain('Set into chapter-1.md');
    expect(desk.files['chapter-1.md']).toBe('She locked the drawer.\n\nThe key went into the blue jar on the sill.\n\nShe went to bed.');
    expect(await takeStep(desk, readStep(step('Too much.', 'plant', 'chapter-1.md', `She locked the drawer\n===\n${Array.from({ length: 200 }, () => 'word').join(' ')}`)), 2, async () => '')).toContain('at most 120 words');
    expect(await takeStep(desk, readStep(step('Where?', 'plant', 'chapter-1.md', 'A paragraph that is not there\n===\nA line.')), 2, async () => '')).toContain('was not found');
  });
  it('gives the same answer, free, when a reader is asked again about text they have read, and charges more for each new reader of a chapter', async () => {
    const desk = newDesk(2); desk.files['chapter-1.md'] = 'She locked the drawer.'; desk.told_promises = true; let asked = 0;
    const ask = async () => { asked++; desk.spent++; return `Reader ${asked}: I would turn the page.`; };
    const read = () => takeStep(desk, readStep(step('Read it.', 'ask_reader', 'chapter-1.md', '')), 2, ask);
    expect(await read()).toContain('Reader 1'); expect(desk.spent).toBe(1);
    expect(await read()).toContain('has already read the book through chapter-1.md as it now stands'); expect(asked).toBe(1); expect(desk.spent).toBe(1);
    await takeStep(desk, readStep(step('Again.', 'write', 'chapter-1.md', 'She left the drawer open.')), 2, ask);
    expect(await read()).toContain('Reader 2'); expect(desk.spent).toBe(4);
    // The chapter has had its one rewrite: a second is not carried out, so the reader who read it has nothing new to read.
    expect(await takeStep(desk, readStep(step('Again.', 'write', 'chapter-1.md', 'She burned the drawer.')), 2, ask)).toContain('has been written again once already');
    expect(desk.files['chapter-1.md']).toBe('She left the drawer open.');
    expect(await read()).toContain('has already read the book through chapter-1.md'); expect(asked).toBe(2); expect(desk.spent).toBe(4);
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
    expect(Object.keys(tabs)).toEqual(['Reader', 'Characters', 'Keeper', 'Set in', 'Envelope', 'Notebook']);
    expect(tabs.Envelope.text).toContain('has not written down what really happened');
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
