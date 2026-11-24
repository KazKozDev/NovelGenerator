import { describe, it, expect } from 'vitest';
import { aiTells, scrubArtifacts } from '../utils/novel/analytics';
import { normalizeChapterBody } from '../utils/novel/manuscript';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const filler = 'Mara carried the bucket up from the well and set it by the door before the light went. ';

describe('scrubArtifacts', () => {
  it('removes invisible characters and turns odd spaces into plain ones', () => {
    const dirty = `The${cp(0x200b)} door${cp(0xfeff)} shut.${cp(0xe0041, 0xe0042)}${cp(0xa0)}She${cp(0x202f)}waited.`;
    expect(scrubArtifacts(dirty)).toBe('The door shut. She waited.');
  });

  it('keeps the joiners that hold an emoji sequence together', () => {
    const family = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(scrubArtifacts(`A sticker ${family} on the fridge.`)).toBe(`A sticker ${family} on the fridge.`);
  });

  it('strips citation markup from each chatbot', () => {
    const leaked = [
      'The mill burned in 1911. :contentReference[oaicite:0]{index=0}',
      'The river rose citeturn0search3 by spring.',
      'He left at dawn [cite: 1, 4].',
      'Gemini [span_1](start_span)said so[span_1](end_span).',
      'Rain all week 【12†L40-52】.',
      'The tax fell [attached_file:1] in May [web:2].',
      'Grok <grok_card data-id="x"></grok_card> agreed.',
    ].join('\n\n');
    expect(scrubArtifacts(leaked)).toBe([
      'The mill burned in 1911.',
      'The river rose by spring.',
      'He left at dawn.',
      'Gemini said so.',
      'Rain all week.',
      'The tax fell in May.',
      'Grok agreed.',
    ].join('\n\n'));
  });

  it('drops tracking parameters but keeps the rest of the link', () => {
    expect(scrubArtifacts('See https://a.org/x?utm_source=chatgpt.com and https://b.org/y?id=3&utm_source=openai.'))
      .toBe('See https://a.org/x and https://b.org/y?id=3.');
    expect(scrubArtifacts('https://c.org/z?utm_source=chatgpt.com&id=4')).toBe('https://c.org/z?id=4');
  });

  it('cuts a chat preamble and sign-off, but not prose that only starts alike', () => {
    const wrapped = 'Certainly! Here is the revised chapter.\n\nThe ferry was late.\n\nLet me know if you would like a darker ending.';
    expect(scrubArtifacts(wrapped)).toBe('The ferry was late.');
    const story = 'Here is the chapter of my life I never told you, she said.\n\nThe ferry was late.';
    expect(scrubArtifacts(story)).toBe(story);
    const narration = 'Sure, he thought, why not.\n\nThe ferry was late.';
    expect(scrubArtifacts(narration)).toBe(narration);
    expect(scrubArtifacts('Certainly!\n\nThe ferry was late.')).toBe('The ferry was late.');
  });

  it('unifies a mix of quotation styles toward the one used most', () => {
    expect(scrubArtifacts('“Go,” she said. “Now.” He didn’t move. "Fine," he said.'))
      .toBe('“Go,” she said. “Now.” He didn’t move. “Fine,” he said.');
    expect(scrubArtifacts('"Go," she said. "Now." He didn\'t move. “Fine,” he said.'))
      .toBe('"Go," she said. "Now." He didn\'t move. "Fine," he said.');
  });

  it('leaves clean prose untouched, italics and scene breaks included, and is idempotent', () => {
    const clean = 'She read the sign: *closed*.\n\n* * *\n\nThe road — empty — ran on.';
    expect(scrubArtifacts(clean)).toBe(clean);
    const dirty = `Sure, here is the scene.\n\nThe ${cp(0x200b)}road ran on citeturn0search0.`;
    expect(scrubArtifacts(scrubArtifacts(dirty))).toBe(scrubArtifacts(dirty));
  });

  it('runs on every chapter body the pipeline normalizes', () => {
    expect(normalizeChapterBody(`## Chapter 2\n\nThe${cp(0x200b)} gate opened [cite: 2].`, 2)).toBe('The gate opened.');
  });
});

describe('aiTells', () => {
  const ids = (text: string) => aiTells(text).map(tell => tell.id);

  it('stays quiet on plain prose and on short texts', () => {
    expect(aiTells(filler.repeat(40))).toEqual([]);
    expect(aiTells('A testament to a pivotal, vibrant, meticulous tapestry.')).toEqual([]);
  });

  it('counts a cluster of AI vocabulary and shows the words', () => {
    const text = filler.repeat(30) + 'The harbor was a vibrant tapestry, a testament to meticulous trade, its pivotal role underscored by every ship. ';
    const tell = aiTells(text).find(item => item.id === 'ai-vocabulary');
    expect(tell).toBeDefined();
    expect(tell!.examples).toEqual(expect.arrayContaining(['vibrant', 'tapestry']));
  });

  it('does not count fiction words the list leaves out', () => {
    const text = filler.repeat(30) + 'She walked quietly. Her hand was steady. The bell echoed. That key matters. '.repeat(3);
    expect(ids(text)).not.toContain('ai-vocabulary');
  });

  it('flags copula avoidance, negative parallelism and participle tails', () => {
    const text = filler.repeat(30) + [
      'The tower serves as a beacon. The bridge stands as a symbol. The square functions as a market.',
      'It was not fear, it was arithmetic. Not only the rain but the silence fell. No maps, no lanterns, just the river.',
      'The gate opened, highlighting the change. The bells rang, symbolizing hope. The crowd cheered, reflecting the mood.',
    ].join(' ');
    expect(ids(text)).toEqual(expect.arrayContaining(['copula-avoidance', 'negative-parallelism', 'participle-tail']));
  });

  it('flags puffery and hedging, and chatbot leftovers on a single hit', () => {
    const text = filler.repeat(30) + 'It was a pivotal moment and an enduring legacy. Experts say it mattered. It is important to note the cost. Then [Character Name] arrived.';
    expect(ids(text)).toEqual(expect.arrayContaining(['significance-puffery', 'hedging-attribution', 'chatbot-leftovers']));
  });

  it('flags em-dash density and a text with no punctuation but commas and stops', () => {
    const dashy = 'She ran — fast — then stopped — listening. '.repeat(10) + filler.repeat(20);
    expect(ids(dashy)).toContain('em-dash-density');
    expect(ids(filler.repeat(110))).toContain('flat-punctuation');
    expect(ids(filler.repeat(110) + 'She paused; then went on.')).not.toContain('flat-punctuation');
  });

  it('flags a rule of three only at a rate', () => {
    const triads = 'He packed bread, salt, and rope. She saw fog, rain, and ice. They wanted gold, land, and peace. ';
    expect(ids(filler.repeat(20) + triads.repeat(3))).toContain('rule-of-three');
    expect(ids(filler.repeat(40) + triads)).not.toContain('rule-of-three');
    const clauses = 'He smiled, and she smiled, and the room eased. It was the moment, she knew, and it passed. Her voice, low and unfamiliar, and dry. ';
    expect(ids(filler.repeat(20) + clauses.repeat(3))).not.toContain('rule-of-three');
  });

  it('flags chat formatting inside prose but not italics', () => {
    expect(ids(filler.repeat(30) + 'He felt **the weight** of it.')).toContain('markdown-in-prose');
    expect(ids(filler.repeat(30) + 'He felt *the weight* of it.')).not.toContain('markdown-in-prose');
  });
});

describe('04 · AI tells review', async () => {
  const { indexManuscriptBlocks } = await import('../utils/novel/hybridSearch');
  const { buildEditorialAgentPrompt, runEditorialTurn, tellSuspects } = await import('../utils/novel/editorialAgent');
  const { buildEntityGraph } = await import('../utils/novel/entityGraph');
  const { QUICK_PROMPTS } = await import('../components/EditorialChatStudio');

  const plain = Array.from({ length: 12 }, (_, i) => `Mara carried bucket ${i} up from the well and set it by the door before the light went.`);
  const tells = [
    'The harbor was a vibrant tapestry, a testament to meticulous trade, its pivotal role underscored by every ship.',
    'The tower serves as a beacon, highlighting the change. It was a pivotal moment and an enduring legacy.',
  ];
  const book = [
    `## Chapter 1\n\n${plain.join('\n\n')}`,
    `## Chapter 2\n\n${[...plain.slice(0, 5), tells[0], ...plain.slice(5, 9), tells[1], ...plain.slice(9), 'He felt **the weight** of it.'].join('\n\n')}`,
  ].join('\n\n');
  const blocks = indexManuscriptBlocks(book);

  it('points at the paragraphs that carry the tells, and nowhere else', () => {
    const suspects = tellSuspects(blocks);
    const places = suspects.flatMap(s => s.places);
    expect(suspects[0].claim).toMatch(/^markdown-in-prose in Chapter 2/);
    expect(suspects.some(s => s.claim.startsWith('ai-vocabulary in Chapter 2') && s.places.includes('ch2_p5'))).toBe(true);
    expect(places.every(id => id.startsWith('ch2_'))).toBe(true);
    expect(places).not.toContain('ch2_p0');
  });

  it('gives the review its rates and passages, and no skeletons', () => {
    const { prompt, system } = buildEditorialAgentPrompt({ userPrompt: 'Check', manuscriptBlocks: blocks, entityGraph: buildEntityGraph(blocks), history: [], view: 'tells' });
    expect(system).toContain('a sign of AI writing shows in the phrases code has found and counted');
    expect(prompt).toContain('RATES CODE MEASURED');
    expect(prompt).toContain('- Chapter 1: nothing above the rates.');
    expect(prompt).toContain('### Suspect 1:');
    expect(prompt).not.toContain('CHAPTER SKELETONS');
  });

  it('runs on code alone before the editor reads: no skeleton calls', async () => {
    const calls: string[] = [];
    const result = await runEditorialTurn({
      userPrompt: QUICK_PROMPTS[3].prompt, bookContent: book, history: [], view: 'tells',
      callModel: async (prompt, system) => { calls.push(system); return 'Nothing to keep.'; },
    });
    expect(calls.some(system => /skeleton|records/i.test(system) && !system.includes('Literary Co-Author'))).toBe(false);
    expect(result.executedTools.map(t => t.tool)).not.toContain('chapter_skeleton');
    expect(result.executedTools.find(t => t.tool === 'code_checks')?.summary).toMatch(/Code found [1-9]/);
  });

  it('is the fourth review button and asks for no edit', () => {
    expect(QUICK_PROMPTS[3].label).toBe('04 · AI tells');
    expect(QUICK_PROMPTS[3].view).toBe('tells');
  });
});
