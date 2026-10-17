import { describe, it, expect, beforeEach } from 'vitest';
import { indexManuscriptBlocks } from '../utils/novel/hybridSearch';
import { chapterSkeleton, cachedSkeletons, checkSuspects, clearSkeletonCache, durationMentions, durationSuspects, findRepeats, skeletonLines, readBlocks, readBookNotes } from '../utils/novel/editorialTools';
import { asksForEdit, buildCloseProblemPrompt, buildEditorialAgentPrompt, clearingQuote, codeRepeatSuspects, codeSuspects, expandPlaces, parseDropped, parseProblems, quoteInBook, parseToolCallsFromModelResponse, runEditorialTurn } from '../utils/novel/editorialAgent';
import { buildEntityGraph } from '../utils/novel/entityGraph';

const SCENE = [
  'Nora pushed the archive door open with her shoulder and the cold air of the basement met her at once.',
  'The pump stood behind the grille, silent, its red lamp dark for the first time in eleven years of service.',
  'She counted the seals on the crate twice before she let herself believe that one of them had been cut.',
];

const BOOK = `
## Chapter 1

${SCENE.join('\n\n')}

Ilya waited upstairs until twenty to six and then left without a word to anyone in the building.

## Chapter 2

The inspector arrived at nine in the morning and asked who had signed for the crate on Thursday.

${SCENE.join('\n\n')}

## Chapter 3

The rain had not stopped since Thursday and the river was rising fast against the old stone embankment.

The rain had not stopped since Thursday and the river was rising fast against the old stone embankment.
`.trim();

describe('editorial reading tools', () => {
  beforeEach(() => clearSkeletonCache());

  it('finds a passage told twice and a sentence said twice', () => {
    const blocks = indexManuscriptBlocks(BOOK);
    const found = findRepeats(blocks);
    expect(found.passages[0]).toMatchObject({ first: ['ch1_p0', 'ch1_p2'], second: ['ch2_p1', 'ch2_p3'], paragraphs: 3 });
    expect(found.passages.some(p => p.first[0] === 'ch3_p0' && p.second[0] === 'ch3_p1')).toBe(true);
    expect(findRepeats(blocks, 3).passages).toHaveLength(1);
  });

  it('does not call a refrain inside different paragraphs a repeated passage', () => {
    const refrain = 'The clock in the hall struck the hour once again tonight.';
    const blocks = indexManuscriptBlocks(`## Chapter 1\n\nShe sat by the window and waited for the letter that never came. ${refrain}\n\n## Chapter 2\n\nHe walked to the station in the snow and bought a ticket south. ${refrain}`);
    const found = findRepeats(blocks);
    expect(found.passages).toHaveLength(0);
    expect(found.sentences[0].blockIds).toEqual(['ch1_p0', 'ch2_p0']);
  });

  it('reads paragraphs of a chapter in order and says where the chapter continues', () => {
    const blocks = indexManuscriptBlocks(BOOK);
    const text = readBlocks(blocks, 1, 1, 2);
    expect(text).toContain('[ch1_p1]');
    expect(text).toContain('[ch1_p2]');
    expect(text).not.toContain('[ch1_p0]');
    expect(text).toContain('continues to ch1_p3');
    expect(readBlocks(blocks, 9)).toContain('no text');
  });

  it('shows each suspect\'s places with a paragraph either side', () => {
    const blocks = indexManuscriptBlocks(BOOK);
    const text = checkSuspects(blocks, [
      { claim: 'Who signed for the crate', places: ['ch2_p0', 'ch1_p1-ch1_p2'] },
      { claim: 'A wrong id', places: ['ch9_p1'] },
    ]);
    expect(text).toContain('### Suspect 1: Who signed for the crate');
    expect(text).toContain('[ch2_p0]');
    expect(text).toContain('[ch2_p1]');
    expect(text).toContain('[ch1_p0]');
    expect(text).toContain('[ch1_p3]');
    expect(text).toContain('### Suspect 2: A wrong id');
    expect(text).toContain('No paragraph with id ch9_p1');
    expect(checkSuspects(blocks, [])).toBe('No suspects given.');
  });

  it('splits a skeleton section written as one line into its items', () => {
    const lines = skeletonLines([{ chapter: 4, skeleton: 'TIME: Friday at nine, Hale comes [ch4_p4]. About five that morning, Daniel found [ch4_p18].' }]);
    expect(lines.map(l => l.text)).toEqual(['Friday at nine, Hale comes [ch4_p4]', 'About five that morning, Daniel found [ch4_p18].']);
  });

  it('reads at most the given number of paragraphs', () => {
    const blocks = indexManuscriptBlocks(BOOK);
    expect(readBlocks(blocks, 1, 0, 3, 2)).not.toContain('[ch1_p2]');
  });

  it('lists spans of time, leaving out moments and ages, and pairs spans told of one thing', () => {
    const blocks = indexManuscriptBlocks([
      '## Chapter 1', 'She had carried the keycard to Room 412 for eleven weeks.', 'That was two weeks ago.', 'A nineteen-year-old clerk smiled.',
      '## Chapter 2', '"Just over a year," she said of the keycard she carried to Room 412.', 'They had been married nine years.',
    ].join('\n\n'));
    const mentions = durationMentions(blocks);
    expect(mentions.map(m => [m.id, m.phrase, m.days])).toEqual([['ch1_p0', 'eleven weeks', 77], ['ch2_p0', 'a year', 365], ['ch2_p1', 'nine years', 3285]]);
    expect(durationSuspects(mentions)).toEqual([{ claim: 'Two spans for what may be one thing: "eleven weeks" (ch1_p0) and "a year" (ch2_p0)', places: ['ch1_p0', 'ch2_p0'] }]);
  });

  it('reads the book notes the author left', () => {
    const notes = readBookNotes({ premise: 'A pump fails in an archive.', dossier: { truth: 'Nora signed first.' }, craft: {} });
    expect(notes).toContain('## Premise');
    expect(notes).toContain('Nora signed first.');
    expect(readBookNotes(undefined)).toContain('no saved notes');
  });

  it('keeps a skeleton until its chapter changes', async () => {
    let calls = 0;
    const callModel = async () => { calls++; return `SCENES: archive; Nora; finds a cut seal [ch1_p2]`; };
    const blocks = indexManuscriptBlocks(BOOK);
    await chapterSkeleton(blocks, 1, callModel);
    await chapterSkeleton(blocks, 1, callModel);
    expect(calls).toBe(1);
    expect(cachedSkeletons(blocks).map(s => s.chapter)).toEqual([1]);

    const changed = indexManuscriptBlocks(BOOK.replace('eleven years', 'twelve years'));
    expect(cachedSkeletons(changed)).toEqual([]);
    await chapterSkeleton(changed, 1, callModel);
    expect(calls).toBe(2);
  });
});

describe('editorial agent with reading tools', () => {
  beforeEach(() => clearSkeletonCache());

  it('parses the new tools and describes every tool in the prompt', () => {
    const tools = parseToolCallsFromModelResponse('```tool:find_repeats\n{}\n```\n```tool:read_blocks\n{"chapter": 2, "from": 0, "to": 3}\n```');
    expect(tools.map(t => t.tool)).toEqual(['find_repeats', 'read_blocks']);

    const blocks = indexManuscriptBlocks(BOOK);
    const { system } = buildEditorialAgentPrompt({ userPrompt: 'Check the plot', manuscriptBlocks: blocks, entityGraph: buildEntityGraph(blocks), history: [] });
    for (const tool of ['inspect_dependencies', 'read_blocks', 'chapter_skeleton', 'find_repeats', 'check_suspects']) expect(system).toContain(tool);
    expect(system).toContain('do not invent problems');
    expect(system).toContain('A reply that calls tools holds only the tool calls');
  });

  it('puts cached skeletons into the next prompt', async () => {
    const blocks = indexManuscriptBlocks(BOOK);
    await chapterSkeleton(blocks, 2, async () => 'LEARNED: inspector asks who signed [ch2_p0]');
    const { prompt } = buildEditorialAgentPrompt({ userPrompt: 'Check the plot', manuscriptBlocks: blocks, entityGraph: buildEntityGraph(blocks), history: [] });
    expect(prompt).toContain('CHAPTER SKELETONS');
    expect(prompt).toContain('inspector asks who signed');
  });

  it('gives the author\'s notes with the manuscript', () => {
    const blocks = indexManuscriptBlocks(BOOK);
    const graph = buildEntityGraph(blocks);
    const { prompt } = buildEditorialAgentPrompt({ userPrompt: 'Check the plot', manuscriptBlocks: blocks, entityGraph: graph, history: [], metadata: { premise: 'A pump fails in an archive.' } });
    expect(prompt).toContain("AUTHOR'S NOTES");
    expect(prompt).toContain('A pump fails in an archive.');
    expect(buildEditorialAgentPrompt({ userPrompt: 'x', manuscriptBlocks: blocks, entityGraph: graph, history: [] }).prompt).not.toContain("AUTHOR'S NOTES");
  });

  it('reads suspects in one round and hands their passages back', async () => {
    const prompts: string[] = [];
    const callModel = async (prompt: string) => {
      prompts.push(prompt);
      if (prompts.length === 1) return '```tool:check_suspects\n{"suspects": [{"claim": "Ilya leaves at twenty to six", "places": ["ch1_p3"]}]}\n```';
      return 'Nothing in the text makes it a hole.';
    };
    const result = await runEditorialTurn({ userPrompt: 'Check the plot', bookContent: BOOK, history: [], callModel });
    expect(result.executedTools.map(t => t.tool)).toEqual(['check_suspects']);
    expect(prompts[1]).toContain('### Suspect 1: Ilya leaves at twenty to six');
    expect(prompts[1]).toContain('[ch1_p3]: Ilya waited upstairs');
  });

  it('shows the book as skeletons, not prose, in the skeleton view', async () => {
    const prompts: string[] = [];
    const callModel = async (prompt: string, system: string) => {
      if (system.includes('dry skeleton')) return `KNOWS: skeleton line of chapter ${prompt.match(/CHAPTER (\d+)/)![1]}`;
      prompts.push(prompt);
      return 'Nothing found.';
    };
    const result = await runEditorialTurn({ userPrompt: 'Check the plot', bookContent: BOOK, history: [], view: 'skeletons', callModel });
    expect(result.executedTools[0]).toEqual({ tool: 'chapter_skeleton', summary: 'Skeletons of 3 chapters' });
    expect(prompts[0]).toContain('KNOWS: skeleton line of chapter 2');
    expect(prompts[0]).toContain('ch1_p0..ch1_p3');
    expect(prompts[0]).toContain('SPANS OF TIME STATED IN THE BOOK');
    // Only the passages of code's suspicions appear, never the whole text.
    expect(prompts[0]).not.toContain('the river was rising fast');
    expect(prompts[0]).not.toContain('FULL MANUSCRIPT TEXT');
  });

  it('turns problem blocks into cards and keeps them out of the message', async () => {
    const review = 'One hole.\n```problem\n{"title": "Body found at five and at noon", "places": ["ch4_p18", "ch6_p1"], "ways": ["Make both five", "Make both noon"]}\n```\n```problem\nnot json\n```\nDone.';
    expect(parseProblems(review)).toMatchObject([{ title: 'Body found at five and at noon', places: ['ch4_p18', 'ch6_p1'], ways: ['Make both five', 'Make both noon'] }]);
    const result = await runEditorialTurn({ userPrompt: 'Check the plot', bookContent: BOOK, history: [], callModel: async () => review });
    expect(result.problems).toHaveLength(1);
    expect(result.assistantMessage).not.toContain('```problem');
    expect(result.assistantMessage).toContain('Done.');
  });

  it('copies kept problems out of a prose review when the request asked for problem blocks', async () => {
    const calls: string[] = [];
    const callModel = async (prompt: string, system: string) => {
      calls.push(system);
      if (system.includes('You copy kept')) return '```problem\n{"title": "Body found twice", "places": ["ch4_p18"], "ways": ["Make both five"]}\n```';
      return 'Kept: the body is found at five and at noon (ch4_p18).';
    };
    const result = await runEditorialTurn({ userPrompt: 'Review it, then one block:\n```problem\n{}\n```', bookContent: BOOK, history: [], callModel });
    expect(calls).toHaveLength(2);
    expect(result.problems.map(p => p.title)).toEqual(['Body found twice']);
    expect(result.assistantMessage).toContain('Kept: the body');
    const invented = await runEditorialTurn({ userPrompt: 'Review it, then one block:\n```problem\n{}\n```', bookContent: BOOK, history: [], callModel: async (_p, system) => system.includes('You copy kept') ? '```problem\n{"title": "Unexplained ending", "places": ["ch3_p9"], "ways": []}\n```' : 'I will read the rest first.' });
    expect(invented.problems).toEqual([]);
    const plain = await runEditorialTurn({ userPrompt: 'Check the plot', bookContent: BOOK, history: [], callModel: async () => 'Nothing found.' });
    expect(plain.problems).toEqual([]);
  });

  it('accepts a quote only when it stands in the book word for word', () => {
    expect(quoteInBook('“Ilya waited upstairs until twenty to six”', BOOK)).toBe(true);
    expect(quoteInBook('Nora pushed the archive door open … the cold air of the basement met her', BOOK)).toBe(true);
    expect(quoteInBook('Ilya waited downstairs until six', BOOK)).toBe(false);
    expect(quoteInBook('in this context', BOOK)).toBe(false);
    expect(quoteInBook('', BOOK)).toBe(false);
  });

  it('keeps a dropped suspect whose clearing quote is not in the book', async () => {
    const review = [
      'Kept: none.',
      '```dropped\n{"title": "Ilya leaves early", "places": ["ch2_p0"], "quote": "Ilya waited upstairs until twenty to six"}\n```',
      '```dropped\n{"title": "Inspector at nine", "places": ["ch2_p0"], "quote": "in this context the hour is a guess"}\n```',
      '```problem\n{"title": "Seal cut", "places": ["ch1_p2"], "ways": ["Show who cut it"]}\n```',
    ].join('\n');
    expect(parseDropped(review).map(d => d.title)).toEqual(['Ilya leaves early', 'Inspector at nine']);
    const result = await runEditorialTurn({ userPrompt: 'Review, with ```problem and ```dropped blocks', bookContent: BOOK, history: [], callModel: async () => review });
    expect(result.problems.map(p => p.title)).toEqual(['Seal cut', 'Inspector at nine (dropped without a quote that clears it)']);
    expect(result.assistantMessage).toContain('Kept after all');
    expect(result.assistantMessage).not.toContain('```dropped');
  });

  it('accepts a clearing quote from the book or from the author\'s notes', () => {
    expect(expandPlaces(['ch1_p1-ch1_p3', 'ch2_p0'])).toEqual(['ch1_p1', 'ch1_p2', 'ch1_p3', 'ch2_p0']);
    expect(clearingQuote({ quote: 'Ilya waited upstairs until twenty to six' }, BOOK)).toBe('ok');
    const notes = readBookNotes({ premise: 'Claire planned the frame-up and hides it until the climax.' });
    expect(clearingQuote({ quote: 'Claire planned the frame-up and hides it' }, BOOK, notes)).toBe('ok');
    expect(clearingQuote({ quote: 'Claire planned the frame-up and hides it' }, BOOK)).toBe('missing');
    expect(clearingQuote({ quote: 'Ilya waited downstairs all night' }, BOOK, notes)).toBe('missing');
  });

  it('turns a passage standing twice in the text into a code suspicion', () => {
    const suspects = codeSuspects(indexManuscriptBlocks(BOOK));
    expect(suspects[0]).toMatchObject({ places: ['ch1_p0-ch1_p2', 'ch2_p1-ch2_p3'] });
    expect(suspects[0].claim).toContain('A passage stands twice in the text');
  });

  it('reviews repeats like plot holes: code finds them, passages come with them, no plot sections', async () => {
    const blocks = indexManuscriptBlocks(BOOK);
    expect(codeRepeatSuspects(blocks)[0]).toMatchObject({ places: ['ch1_p0-ch1_p2', 'ch2_p1-ch2_p3'] });
    const prompts: string[] = [];
    const callModel = async (prompt: string, system: string) => {
      if (system.includes('dry skeleton')) return '{}';
      prompts.push(prompt);
      return 'Kept one.\n```problem\n{"title": "Archive scene pasted twice", "places": ["ch2_p1-ch2_p3"], "ways": ["Cut the second telling"]}\n```';
    };
    const result = await runEditorialTurn({ userPrompt: 'Repeats with ```problem blocks', bookContent: BOOK, history: [], view: 'repeats', callModel });
    expect(result.executedTools.map(t => t.tool)).toEqual(['chapter_skeleton', 'code_checks']);
    expect(prompts[0]).toContain('passages standing twice in the text, and sentences said more than once');
    expect(prompts[0]).toContain('### Suspect 1: A passage stands twice in the text');
    expect(prompts[0]).not.toContain('SPANS OF TIME STATED IN THE BOOK');
    expect(prompts[0]).not.toContain('FULL MANUSCRIPT TEXT');
    expect(result.problems.map(p => p.title)).toEqual(['Archive scene pasted twice']);
  });

  it('runs an identical call once in a review, and no find_repeats in the Repeats review', async () => {
    const prompts: string[] = [];
    const systems: string[] = [];
    const call = '```tool:read_blocks\n{"chapter": 1, "from": 0, "to": 2}\n```\n```tool:find_repeats\n{}\n```';
    const callModel = async (prompt: string, system: string) => {
      if (system.includes('dry skeleton')) return '{}';
      prompts.push(prompt);
      systems.push(system);
      return prompts.length < 3 ? call : 'Nothing told twice.';
    };
    const result = await runEditorialTurn({ userPrompt: 'Repeats', bookContent: BOOK, history: [], view: 'repeats', callModel });
    expect(result.executedTools.filter(t => t.tool === 'read_blocks')).toHaveLength(1);
    expect(result.executedTools.some(t => t.tool === 'find_repeats')).toBe(false);
    expect(systems[0]).not.toContain('find_repeats');
    expect(prompts[2]).toContain('read_blocks {"chapter":1,"from":0,"to":2} already ran');
    expect(prompts[1]).toContain('find_repeats is not needed');
  });

  it('keeps in a skeleton review only problems that were checked against the text', async () => {
    const callModel = async (prompt: string, system: string) => {
      if (system.includes('dry skeleton')) return '{}';
      if (prompt.includes('Tool Observations')) return [
        'Kept two.',
        '```problem\n{"title": "Checked hole", "places": ["ch1_p3"], "ways": ["Fix the hour"]}\n```',
        '```problem\n{"title": "New idea", "places": ["ch3_p0"], "ways": ["Rewrite"]}\n```',
      ].join('\n');
      return '```tool:check_suspects\n{"suspects": [{"claim": "Ilya leaves", "places": ["ch1_p3"]}]}\n```';
    };
    const result = await runEditorialTurn({ userPrompt: 'Review with ```problem blocks', bookContent: BOOK, history: [], view: 'skeletons', callModel });
    expect(result.problems.map(p => p.title)).toEqual(['Checked hole']);
    expect(result.assistantMessage).toContain('Not kept: not among the suspicions checked against the text');
    expect(result.assistantMessage).toContain('- New idea (ch3_p0)');
  });

  it('closes a problem with linked patches and re-reads the changed chapter once', async () => {
    const problem = parseProblems('```problem\n{"title": "Ilya leaves at twenty to six", "places": ["ch1_p3"], "ways": ["Make it half past five"]}\n```')[0];
    const prompt = buildCloseProblemPrompt(problem, problem.ways[0]);
    expect(asksForEdit(prompt)).toBe(true);
    expect(prompt).toContain('ch1_p3');
    const skeletonPrompts: string[] = [];
    const callModel = async (text: string, system: string) => {
      if (system.includes('dry skeleton')) { skeletonPrompts.push(text); return 'TIME: Ilya leaves at half past five [ch1_p3]'; }
      return '```tool:propose_diff\n{"chapter": 1, "search": "until twenty to six", "replace": "until half past five", "rationale": "One hour for Ilya"}\n```';
    };
    const result = await runEditorialTurn({ userPrompt: prompt, bookContent: BOOK, history: [], closing: { title: problem.title }, callModel });
    expect(result.diffCards).toHaveLength(1);
    expect(skeletonPrompts).toHaveLength(1);
    expect(skeletonPrompts[0]).toContain('half past five');
    expect(result.assistantMessage).toContain('With these changes, the skeleton of Chapter 1 says about it');
    expect(result.assistantMessage).toContain('- ch1: Ilya leaves at half past five');
  });

  it('tells the model its last round is for the answer', async () => {
    const prompts: string[] = [];
    const callModel = async (prompt: string) => { prompts.push(prompt); return '```tool:read_blocks\n{"chapter": 1}\n```'; };
    await runEditorialTurn({ userPrompt: 'Check the plot', bookContent: BOOK, history: [], callModel });
    expect(prompts).toHaveLength(5);
    expect(prompts[3]).not.toContain('This is your last step');
    expect(prompts[4]).toContain('This is your last step: make no more tool calls. Write your answer now');
  });

  it('runs the reading tools and hands their results back', async () => {
    const prompts: string[] = [];
    const callModel = async (prompt: string, system: string) => {
      if (system.includes('dry skeleton')) return `SCENES: skeleton of ${prompt.match(/CHAPTER (\d+)/)![1]}`;
      prompts.push(prompt);
      if (prompts.length === 1) return '```tool:find_repeats\n{}\n```\n```tool:chapter_skeleton\n{}\n```\n```tool:read_blocks\n{"chapter": 1, "from": 3}\n```';
      return 'Chapter 2 repeats the archive scene of Chapter 1.';
    };
    const result = await runEditorialTurn({ userPrompt: 'Проверь сюжет', bookContent: BOOK, metadata: { premise: 'A pump fails.' }, history: [], callModel });
    expect(result.executedTools.map(t => t.tool)).toEqual(['find_repeats', 'chapter_skeleton', 'read_blocks']);
    const observed = prompts[1];
    expect(observed).toContain('ch1_p0..ch1_p2 and ch2_p1..ch2_p3');
    expect(observed).toContain('skeleton of 3');
    expect(observed).toContain('A pump fails.');
    expect(observed).toContain('[ch1_p3]: Ilya waited upstairs');
    expect(result.assistantMessage).toContain('repeats the archive scene');
  });
});
