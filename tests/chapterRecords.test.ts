import { describe, it, expect, beforeEach } from 'vitest';
import { findSuspects, keysOf, openQuestions, pacingSuspects, parseRecords, recordsPrompt, renderRecords, type ChapterRecords } from '../utils/novel/chapterRecords';
import { cachedRecords, chapterSkeleton, chapterSkeletons, clearSkeletonCache, knowledgeByPair } from '../utils/novel/editorialTools';
import { indexManuscriptBlocks } from '../utils/novel/hybridSearch';
import { buildEditorialAgentPrompt } from '../utils/novel/editorialAgent';
import { buildEntityGraph } from '../utils/novel/entityGraph';

const empty = (): ChapterRecords => ({ scenes: [], events: [], positions: [], objects: [], knowledge: [], knows: [], open: [] });
const records = (part: Partial<ChapterRecords>): ChapterRecords => ({ ...empty(), ...part });

describe('chapter records', () => {
  beforeEach(() => clearSkeletonCache());

  it('reads the JSON out of a reply and renders it as a skeleton', () => {
    const parsed = parseRecords('Here it is:\n```json\n{"events": [{"key": "body found", "what": "Daniel found", "when": "about five", "told": "now", "paragraph": "ch4_p18"}], "knowledge": [{"character": "Nora", "key": "wife name", "fact": "the wife is Claire", "knows": false, "how": "does not know", "paragraph": "ch1_p21"}], "objects": [{"key": "cord"}]}\n```');
    expect(parsed!.events[0]).toMatchObject({ key: 'body found', when: 'about five', told: 'now' });
    expect(parsed!.knowledge[0].knows).toBe(false);
    const text = renderRecords(parsed!);
    expect(text).toContain('TIME:\n- about five: Daniel found [ch4_p18]');
    expect(text).toContain('KNOWS:\n- Nora does NOT know: the wife is Claire [ch1_p21]');
    expect(parseRecords('no json here')).toBeUndefined();
  });

  it('keeps plain KNOWS lines and groups them by pair, marking what a character does not know', () => {
    const parsed = parseRecords(JSON.stringify({
      knows: ["Nora knows Daniel's wife Claire is at her sister's [ch1_p12]", 'Nora does not recognize the name Claire Whitcombe [ch1_p21]'],
      positions: [{ character: 'Claire', place: "her sister's", paragraph: 'ch1_p12' }],
    }))!;
    const skeleton = renderRecords(parsed);
    expect(skeleton).toContain("KNOWS:\n- Nora knows Daniel's wife Claire is at her sister's [ch1_p12]");
    const pairs = knowledgeByPair([{ chapter: 1, skeleton }]);
    expect(pairs).toContain('### What Nora about Claire');
    expect(pairs).toContain('- ch1 NOT: Nora does not recognize the name Claire Whitcombe [ch1_p21]');
  });

  it('asks each chapter to reuse the keys of the chapters before it', async () => {
    const book = '## Chapter 1\n\nDaniel was found at five.\n\n## Chapter 2\n\nDaniel was found at noon.';
    const prompts: string[] = [];
    const callModel = async (prompt: string) => {
      prompts.push(prompt);
      const chapter = prompt.match(/CHAPTER (\d+)/)![1];
      return JSON.stringify({ events: [{ key: 'body found', what: 'Daniel found', when: chapter === '1' ? 'five' : 'noon', told: 'now', paragraph: `ch${chapter}_p0` }] });
    };
    const blocks = indexManuscriptBlocks(book);
    await chapterSkeletons(blocks, [2, 1], callModel);
    expect(prompts[0]).toContain('CHAPTER 1');
    expect(prompts[0]).not.toContain('KEYS EARLIER CHAPTERS USED');
    expect(prompts[1]).toContain('events: ["body found"]');
    expect(cachedRecords(blocks)).toHaveLength(2);
    expect(await chapterSkeleton(blocks, 1, async () => { throw new Error('cached'); })).toContain('five: Daniel found');
    expect(keysOf(cachedRecords(blocks)).events).toEqual(['body found']);
    expect(recordsPrompt(3, 'text', { events: [], facts: [], objects: [] })).not.toContain('KEYS');
  });

  it('finds one event at two times, a name known then not recognized, an object jump', () => {
    const book = [
      records({
        events: [
          { key: 'Body found', what: 'Daniel found', when: 'about five that morning', told: 'now', paragraph: 'ch4_p18' },
          { key: 'first session', what: 'Whitcombes arrive', when: '', told: 'now', paragraph: 'ch2_p0' },
        ],
        knowledge: [{ character: 'Nora', key: 'wife name', fact: "Daniel's wife is Claire", knows: true, how: 'already knows', paragraph: 'ch1_p12' }],
        objects: [{ key: 'key card', holder: 'Ilya', action: 'kept', paragraph: 'ch2_p3' }],
        positions: [{ character: 'Tom', place: 'the kitchen', when: 'Friday at seven', paragraph: 'ch4_p0' }],
      }),
      records({
        events: [
          { key: 'body found', what: 'Daniel found', when: 'at noon on Friday', told: 'reported', paragraph: 'ch6_p1' },
          { key: 'first session', what: 'Whitcombes arrive', when: '', told: 'now', paragraph: 'ch4_p29' },
          { key: 'first session', what: 'Nora recalls it', when: '', told: 'remembered', paragraph: 'ch5_p2' },
        ],
        knowledge: [{ character: 'Nora', key: 'sender of the email', fact: 'the name Claire Whitcombe', knows: false, how: 'does not recognize', paragraph: 'ch1_p21' }],
        objects: [{ key: 'key card', holder: 'Nora', action: 'used', paragraph: 'ch3_p8' }],
        positions: [{ character: 'Tom', place: 'the Meridian', when: 'Friday at seven', paragraph: 'ch4_p6' }],
        scenes: [{ place: 'Legare Street', present: ['Nora'], what: 'The Whitcombes arrive eleven minutes early for their first session', when: '', paragraphs: ['ch4_p29'] }],
      }),
      records({ scenes: [{ place: 'Legare Street', present: ['Nora'], what: 'The Whitcombes arrive eleven minutes early for the first session; Daniel shakes hands', when: '', paragraphs: ['ch2_p0'] }] }),
    ];
    const claims = findSuspects(book).map(s => s.claim);
    expect(claims).toHaveLength(3);
    expect(claims[0]).toContain('"Body found" is given two times');
    expect(claims.some(c => c.startsWith('Nora knows "Daniel\'s wife is Claire" (ch1_p12) but later does not know'))).toBe(true);
    expect(claims.some(c => c.includes('"key card" is with Ilya (ch2_p3), then with Nora (ch3_p8)'))).toBe(true);
  });

  it('stays quiet where the book agrees or tells how a thing moved', () => {
    const book = [records({
      events: [
        { key: 'call', what: 'phone rings', when: 'twenty past seven', told: 'now', paragraph: 'ch4_p0' },
        { key: 'call', what: 'Tom recalls the call', when: 'Friday morning', told: 'remembered', paragraph: 'ch5_p3' },
      ],
      objects: [
        { key: 'key card', holder: 'Ilya', action: 'kept', paragraph: 'ch2_p3' },
        { key: 'key card', holder: 'Nora', action: 'given', paragraph: 'ch2_p4' },
        { key: 'painting', holder: 'corridor', action: 'appears', paragraph: 'ch1_p1' },
        { key: 'painting', holder: 'Claire', action: 'appears', paragraph: 'ch2_p18' },
        { key: 'phone', holder: 'Nora', action: 'used', paragraph: 'ch3_p15' },
        { key: 'phone', holder: 'the nightstand', action: 'kept', paragraph: 'ch3_p17' },
      ],
      knowledge: [{ character: 'Nora', key: 'room', fact: 'room 614', knows: false, how: 'does not know', paragraph: 'ch1_p1' }, { character: 'Nora', key: 'room', fact: 'room 614', knows: true, how: 'learns from Claire', paragraph: 'ch2_p18' }],
    })];
    expect(findSuspects(book)).toEqual([]);
  });

  it('does not join two different events that were given one key', () => {
    const book = [records({ events: [
      { key: 'Claire session', what: 'Claire describes the hotel room in a session', when: 'Thursday', told: 'now', paragraph: 'ch2_p0' },
      { key: 'Claire session', what: 'Claire moves her appointment by phone', when: 'Wednesday night', told: 'now', paragraph: 'ch2_p107' },
    ] })];
    expect(findSuspects(book)).toEqual([]);
  });

  it('gives Plot holes the code suspicions with their passages', async () => {
    const book = '## Chapter 1\n\nDaniel was found at five that morning.\n\n## Chapter 2\n\nDaniel had been found at noon.';
    const blocks = indexManuscriptBlocks(book);
    await chapterSkeletons(blocks, [1, 2], async prompt => {
      const chapter = prompt.match(/CHAPTER (\d+)/)![1];
      return JSON.stringify({ events: [{ key: 'body found', what: 'Daniel found dead', when: chapter === '1' ? 'five' : 'noon', told: 'now', paragraph: `ch${chapter}_p0` }] });
    });
    const { prompt } = buildEditorialAgentPrompt({ userPrompt: 'Check', manuscriptBlocks: blocks, entityGraph: buildEntityGraph(blocks), history: [], view: 'skeletons' });
    expect(prompt).toContain('SUSPICIONS FOUND BY CODE');
    expect(prompt).toContain('### Suspect 1: "body found" is given two times');
    expect(prompt).toContain('[ch2_p0]: Daniel had been found at noon.');
  });

  it('finds long quiet scenes and events shown then told again, for Pacing', () => {
    const chapter1 = records({
      scenes: [
        { place: 'office', present: ['Nora'], what: 'Nora waits', when: '', paragraphs: ['ch1_p0'] },
        { place: 'hall', present: ['Nora'], what: 'Nora meets Claire', when: '', paragraphs: ['ch1_p10'] },
      ],
      events: [{ key: 'meeting', what: 'Nora meets Claire in the hall', when: '', told: 'now', paragraph: 'ch1_p12' }],
      open: [{ question: 'Who sent the letter?', paragraph: 'ch1_p3' }],
    });
    const chapter2 = records({ events: [{ key: 'meeting', what: 'Nora remembers meeting Claire in the hall', when: '', told: 'remembered', paragraph: 'ch2_p4' }] });
    const suspects = pacingSuspects([chapter1, chapter2], chapter => (chapter === 1 ? 15 : 9));
    expect(suspects).toEqual([
      { claim: 'A scene of 10 paragraphs where the records show no event, nothing learned, and no object changing hands: "Nora waits" (ch1_p0..ch1_p9)', places: ['ch1_p0-ch1_p9'] },
      { claim: '"meeting" is shown (ch1_p12) and told again as remembered (ch2_p4)', places: ['ch1_p12', 'ch2_p4'] },
    ]);
    expect(openQuestions([chapter1, chapter2])).toBe('- ch1_p3: Who sent the letter?');
  });

  it('gives Pacing its own suspicions and the open questions, not the plot sections', async () => {
    const book = `## Chapter 1\n\n${Array.from({ length: 9 }, (_, i) => `Nora sat and waited, paragraph ${i}.`).join('\n\n')}`;
    const blocks = indexManuscriptBlocks(book);
    await chapterSkeletons(blocks, [1], async () => JSON.stringify({
      scenes: [{ place: 'office', present: ['Nora'], what: 'Nora waits', paragraphs: ['ch1_p0'] }],
      open: [{ question: 'Will Claire come?', paragraph: 'ch1_p2' }],
    }));
    const { prompt, system } = buildEditorialAgentPrompt({ userPrompt: 'Check', manuscriptBlocks: blocks, entityGraph: buildEntityGraph(blocks), history: [], view: 'pacing' });
    expect(system).toContain('whether the story moves shows in what changes from scene to scene');
    expect(prompt).toContain('### Suspect 1: A scene of 9 paragraphs');
    expect(prompt).toContain('- ch1_p2: Will Claire come?');
    expect(prompt).not.toContain('SPANS OF TIME STATED IN THE BOOK');
  });
});
