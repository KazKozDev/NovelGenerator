import { describe, it, expect, beforeEach } from 'vitest';
import { indexManuscriptBlocks } from '../utils/novel/hybridSearch';
import { chapterSkeleton, cachedSkeletons, checkSuspects, clearSkeletonCache, findRepeats, knowledgeByPair, objectsBeside, pathsByCharacter, skeletonLines, timesBeside, readBlocks, readBookNotes } from '../utils/novel/editorialTools';
import { asksForEdit, buildCloseProblemPrompt, buildEditorialAgentPrompt, parseProblems, parseToolCallsFromModelResponse, runEditorialTurn } from '../utils/novel/editorialAgent';
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

  it('groups what each character knows about another, in book order, marking what they do not know', () => {
    const text = knowledgeByPair([
      { chapter: 1, skeleton: 'LEARNED:\nNora learns from the email that Claire Whitcombe wants a session [ch1_p21]\n\nKNOWS:\n- Nora knows Daniel\'s wife Claire is at her sister\'s [ch1_p12]\n- Nora does not recognize the name Claire Whitcombe [ch1_p21]\n\nMOVES:\nClaire Whitcombe: at her sister\'s [ch1_p12]' },
      { chapter: 2, skeleton: 'KNOWS:\nNora knows the room number [ch2_p3]' },
    ]);
    expect(text).toContain('### What Nora about Claire');
    const lines = text.split('\n').filter(l => l.startsWith('- '));
    expect(lines[0]).toContain('[ch1_p12]');
    expect(lines[2]).toMatch(/^- ch1 NOT: Nora does not recognize/);
    expect(text).not.toContain('room number');
  });

  it('reads at most the given number of paragraphs', () => {
    const blocks = indexManuscriptBlocks(BOOK);
    expect(readBlocks(blocks, 1, 0, 3, 2)).not.toContain('[ch1_p2]');
  });

  it('sets lines from different chapters side by side: times, paths, objects', () => {
    const skeletons = [
      { chapter: 4, skeleton: 'TIME: Friday at nine, Hale comes [ch4_p4]. About five that morning, Daniel Whitcombe found [ch4_p18].\nMOVES:\nIlya: upstairs at the end of the scene [ch4_p2]\nOBJECTS:\nBrass key to the archive, in Ilya\'s pocket [ch4_p3]' },
      { chapter: 6, skeleton: 'TIME:\n- Daniel found at noon on that Friday [ch6_p1]\nMOVES:\nIlya: in the basement [ch6_p2]\nOBJECTS:\nBrass key to the archive, on Nora\'s desk [ch6_p5]' },
    ];
    expect(skeletonLines(skeletons).filter(l => l.section === 'TIME')).toHaveLength(3);
    const times = timesBeside(skeletons);
    expect(times).toContain('(daniel, found)');
    expect(times).toContain('ch6: Daniel found at noon');
    expect(times).not.toContain('Hale comes');
    expect(pathsByCharacter(skeletons)).toBe('### Ilya\n- ch4: Ilya: upstairs at the end of the scene [ch4_p2]\n- ch6: Ilya: in the basement [ch6_p2]');
    expect(objectsBeside(skeletons)).toContain('ch6: Brass key to the archive, on Nora');
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
    expect(prompts[0]).not.toContain('Ilya waited upstairs');
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
      if (system.includes('copy kept problems')) return '```problem\n{"title": "Body found twice", "places": ["ch4_p18"], "ways": ["Make both five"]}\n```';
      return 'Kept: the body is found at five and at noon (ch4_p18).';
    };
    const result = await runEditorialTurn({ userPrompt: 'Review it, then one block:\n```problem\n{}\n```', bookContent: BOOK, history: [], callModel });
    expect(calls).toHaveLength(2);
    expect(result.problems.map(p => p.title)).toEqual(['Body found twice']);
    expect(result.assistantMessage).toContain('Kept: the body');
    const plain = await runEditorialTurn({ userPrompt: 'Check the plot', bookContent: BOOK, history: [], callModel: async () => 'Nothing found.' });
    expect(plain.problems).toEqual([]);
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
