import { describe, expect, it, vi } from 'vitest';
import { createBookSpec, chapterRole, type ChapterRecord, type NovelRun } from '../utils/novel/contracts';
import { createRun, NovelEngine, validateBlueprint, validateChapterPlan } from '../utils/novel/engine';
import { acceptCandidate, acceptedVersion, addCandidate, canonBefore, endingIssues, nextUnacceptedChapter } from '../utils/novel/storyState';
import { generateProse, parseObject, reviewChapter, structuredResponse, type NovelLLM } from '../utils/novel/review';
import { MemoryRunStore } from '../utils/novel/runStore';
import { compileBook, metadata } from '../utils/novel/presentation';
import { writeScene } from '../utils/novel/writer';

const provider = { provider: 'ollama' as const, ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'fixture' };
const FILLER = [
  'She kept the letter folded in her pocket while the clerk read the register.',
  'Rain moved along the gutter outside and nobody in the room looked up at it.',
  'A clock behind the counter lost a second every hour and no one had fixed it.',
  'The archive smelled of dust, old glue and the cold iron of the shelving.',
  'Somebody had written a name on the ledger and then crossed it out twice.',
  'Her boots left grey half-moons of water across the boards by the door.',
  'The lamp above the desk buzzed whenever a tram passed in the street below.',
  'He counted the coins into her palm slowly, as if the number might change.',
  'Outside, a dog barked once and then thought better of barking again.',
  'The window frame had swollen with damp and would not close all the way.',
  'A child ran past the glass carrying something wrapped in newspaper.',
  'She thought about the boat and about how long the repairs would take.',
  'The clerk turned a page and the sound was louder than either of them expected.',
  'Someone upstairs dragged a chair across the floor and then stopped.',
  'The stove had gone out an hour ago and nobody had said anything about it.',
  'She read the top line again, though she already knew what it said.',
  'A moth circled the lamp twice and settled on the cold part of the shade.',
  'The town outside went on with its afternoon without any interest in either of them.',
].join(' ');

const prose = (number: number) => `Thorne opened door ${number}. ${FILLER} The price was hers to pay.`;
function plan(number: number) {
  return {
    title: `Door ${number}`, summary: `Thorne opens door ${number}.`, sceneBreakdown: 'An encounter at the archive.',
    characterDevelopmentFocus: 'Accept responsibility', plotAdvancement: 'The letter changes hands',
    timelineIndicators: `Day ${number}`, emotionalToneTension: 'quiet uncertainty', connectionToNextChapter: 'Consequences or closure',
    openingHook: 'The door is locked', chapterEnding: 'The choice is made', targetWordCount: 300,
    detailedScenes: [{ sceneId: `scene-${number}`, location: 'archive', participants: ['Thorne'], objective: 'recover letter', conflict: 'clerk refuses', outcome: 'she pays the price', duration: 'one hour', mood: 'tense', keyMoments: ['choice', 'consequence'] }],
  };
}
function blueprint(count: number) {
  return { centralConflict: 'Recover the letter at a cost', protagonistChange: 'Accept responsibility', endingPayoff: 'Pay the price', characters: [{ name: 'Thorne', description: 'A guarded archivist whose clipped speech hides guilt.' }], promises: [{ id: 'letter', description: 'The letter must be recovered at a price', setupChapter: 1, payoffChapter: count, required: true }] };
}
function runWithPlans(count = 3): NovelRun {
  const run = createRun(createBookSpec('Recover a letter', count, { writingMode: 'scenes', targetWordsPerChapter: 300, language: 'English' }), provider);
  run.outline = 'Thorne recovers the letter and accepts the cost.';
  run.blueprint = validateBlueprint(blueprint(count), run.spec);
  run.chapters = Array.from({ length: count }, (_, index): ChapterRecord => ({ number: index + 1, plan: validateChapterPlan(plan(index + 1), run.spec), status: 'pending', versions: [], repairAttempts: 0 }));
  run.blueprint.chapters = run.chapters.map(chapter => chapter.plan);
  run.stage = 'writing';
  return run;
}
function approve(run: NovelRun, number: number, text = prose(number), factValue = `door ${number}`, subject = 'Thorne') {
  const chapter = run.chapters[number - 1];
  const version = addCandidate(chapter, text, 'fixture');
  const evidence = { chapter: number, revision: version.revision, quote: text.slice(0, 24) };
  version.review = { status: 'passed', issues: [], checkedRevision: version.revision };
  version.analysis = { summary: `Accepted chapter ${number}`, facts: [{ id: `door-${number}`, subject, predicate: 'location', value: factValue, knownBy: [subject], evidence }], events: [{ id: `event-${number}`, description: 'A choice', consequences: [], evidence }], promises: number === 1 ? [{ promiseId: 'letter', kind: 'setup', evidence }] : number === run.spec.chapterCount ? [{ promiseId: 'letter', kind: 'payoff', evidence }] : [] };
  acceptCandidate(run, number);
  return version;
}

function fixtureLLM(count = 3): NovelLLM {
  return vi.fn(async (prompt: string, system: string) => {
    if (system.includes('novel architect')) return JSON.stringify({ outline: 'Thorne recovers the letter and accepts the cost.' });
    if (system.includes('explicit novel blueprint')) return JSON.stringify(blueprint(count));
    if (system.includes('plan causally')) return JSON.stringify(plan(Number(prompt.match(/Plan chapter (\d+)/)?.[1])));
    if (system.includes('single prose writer')) return JSON.stringify({ prose: prose(Number(prompt.match(/CHAPTER (\d+) OF/)?.[1])) });
    if (system.includes('continuity and developmental') || system.includes('complete novel through')) return '{"issues":[]}';
    if (system.includes('extract evidence')) {
      const number = Number(prompt.match(/chapter=(\d+)/)?.[1]);
      const revision = Number(prompt.match(/revision=(\d+)/)?.[1]);
      const evidence = { chapter: number, revision, quote: `Thorne opened door ${number}.` };
      return JSON.stringify({ summary: `Thorne opened door ${number} and paid the price.`, facts: [{ id: `door-${number}`, subject: 'Thorne', predicate: 'location', value: `door ${number}`, knownBy: ['Thorne'], evidence }], events: [{ id: `event-${number}`, description: 'Thorne chose to act', consequences: ['Paid a price'], evidence }], promises: number === 1 ? [{ promiseId: 'letter', kind: 'setup', evidence }] : number === count ? [{ promiseId: 'letter', kind: 'payoff', evidence }] : [] });
    }
    if (system.includes('title completed')) return JSON.stringify({ title: 'The Letter' });
    throw new Error(`Unexpected fixture call: ${system}`);
  });
}

describe('Novel contracts and accepted canon', () => {
  it('assigns setup, climax and resolution in short and long books using actual length', () => {
    expect([1, 2, 3].map(number => chapterRole(number, 3))).toEqual(['setup', 'climax', 'resolution']);
    expect(chapterRole(10, 20)).toBe('development');
    expect(chapterRole(19, 20)).toBe('climax');
    expect(chapterRole(20, 20)).toBe('resolution');
  });
  it('does not treat plans or draft facts as accepted canon', () => {
    const run = runWithPlans();
    addCandidate(run.chapters[0], prose(1), 'draft');
    expect(run.canon.facts).toEqual([]);
    expect(nextUnacceptedChapter(run)?.number).toBe(1);
    expect(() => acceptCandidate(run, 1)).toThrow(/reviewed/);
  });
  it('rejects fabricated extraction quotes', () => {
    const run = runWithPlans();
    const version = approve(run, 1);
    const candidate = addCandidate(run.chapters[1], prose(2), 'draft');
    candidate.review = { status: 'passed', issues: [], checkedRevision: 1 };
    candidate.analysis = structuredClone(version.analysis);
    expect(() => acceptCandidate(run, 2)).toThrow(/evidence/);
  });
  it('invalidates downstream chapters, summaries and final review when an early edit moves canon', () => {
    const run = runWithPlans();
    [1, 2, 3].forEach(number => approve(run, number));
    run.finalReview = { status: 'passed', issues: [], checkedRevision: 0 };
    approve(run, 1, prose(1).replace('door 1', 'door 9'), 'door 9');
    expect(run.chapters.map(chapter => chapter.status)).toEqual(['accepted', 'invalidated', 'invalidated']);
    expect(Object.keys(run.canon.summaries)).toEqual(['1']);
    expect(run.finalReview).toBeUndefined();
    expect(run.chapters[0].versions).toHaveLength(2);
    expect(canonBefore(run, 2).facts[0].evidence.revision).toBe(2);
  });
  it('re-reviews only the later chapters that speak about the subject whose fact moved', () => {
    const run = runWithPlans();
    approve(run, 1, prose(1), 'door 1', 'Thorne');
    approve(run, 2, prose(2), 'door 2', 'The clerk');
    approve(run, 3, prose(3), 'door 3', 'Thorne');
    approve(run, 1, prose(1).replace('door 1', 'door 9'), 'door 9', 'Thorne');
    // Chapter 2 never speaks about Thorne, so nothing it says can now contradict canon.
    expect(run.chapters.map(chapter => chapter.status)).toEqual(['accepted', 'accepted', 'invalidated']);
  });
  it('still re-reviews everything downstream when the move is not confined to one subject', () => {
    const run = runWithPlans();
    [1, 2, 3].forEach(number => approve(run, number, prose(number), `door ${number}`, `Voice ${number}`));
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, prose(1), 'fixture');
    const evidence = { chapter: 1, revision: version.revision, quote: prose(1).slice(0, 24) };
    version.review = { status: 'passed', issues: [], checkedRevision: version.revision };
    version.analysis = { summary: 'A different synopsis entirely', facts: [{ id: 'door-1', subject: 'Voice 1', predicate: 'location', value: 'door 1', knownBy: ['Voice 1'], evidence }], events: [{ id: 'event-1', description: 'A choice', consequences: [], evidence }], promises: [{ promiseId: 'letter', kind: 'setup', evidence }] };
    acceptCandidate(run, 1);
    expect(run.chapters.map(item => item.status)).toEqual(['accepted', 'invalidated', 'invalidated']);
  });
  it('leaves later chapters accepted when a revision changes prose but not what canon says', () => {
    const run = runWithPlans();
    [1, 2, 3].forEach(number => approve(run, number));
    run.finalReview = { status: 'passed', issues: [], checkedRevision: 0 };
    approve(run, 1, `${prose(1)} A quieter coda closed the hour.`);
    expect(run.chapters.map(chapter => chapter.status)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(Object.keys(run.canon.summaries)).toEqual(['1', '2', '3']);
    // The book text still changed, so the whole-book verdict is never carried over.
    expect(run.finalReview).toBeUndefined();
  });
  it('requires evidence for the ending rather than planned promises', () => {
    const run = runWithPlans();
    expect(endingIssues(run)).toHaveLength(2);
    [1, 2, 3].forEach(number => approve(run, number));
    expect(endingIssues(run)).toEqual([]);
    expect(() => compileBook(run)).toThrow(/reviewed/);
  });
});

describe('Editorial gates', () => {
  it('clarifies the JSON envelope and supplies the failed prose for format correction', async () => {
    const llm = vi.fn<NovelLLM>()
      .mockResolvedValueOnce('She closed the door. "Stay," he said.')
      .mockResolvedValueOnce(JSON.stringify({ prose: 'She closed the door. "Stay," he said.' }));
    await expect(generateProse(llm, 'Repair the chapter.', 'Return only prose.')).resolves.toBe('She closed the door. "Stay," he said.');
    expect(llm.mock.calls[0][1]).toContain('not the response envelope');
    expect(llm.mock.calls[1][0]).toContain(JSON.stringify('She closed the door. "Stay," he said.'));
  });

  it('identifies the failing structured operation without accepting malformed data', async () => {
    await expect(structuredResponse('Extract facts.', 'editor', async () => 'invalid', ['facts'], raw => raw))
      .rejects.toThrow('validator; expected fields: facts');
  });

  it('routes prose to the writer and structured editorial work to the validator', async () => {
    const llm = vi.fn(async (_prompt: string, _system: string, options?: Parameters<NovelLLM>[2]) =>
      options?.route === 'writer' ? JSON.stringify({ prose: 'Complete scene.' }) : JSON.stringify({ value: 'checked' }),
    );
    await expect(generateProse(llm, 'Write it.', 'writer')).resolves.toBe('Complete scene.');
    await expect(structuredResponse('Check it.', 'editor', llm, ['value'], raw => raw.value)).resolves.toBe('checked');
    expect(llm.mock.calls.map(call => call[2]?.route)).toEqual(['writer', 'validator']);
  });
  it('does not call a failed or malformed review passed', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], prose(1), 'draft');
    expect((await reviewChapter(run, run.chapters[0], candidate, async () => { throw new Error('offline'); })).status).toBe('not_checked');
    expect((await reviewChapter(run, run.chapters[0], candidate, async () => '{}')).status).toBe('not_checked');
  });
  it('checks full prose and blocks supported knowledge leakage', async () => {
    const run = runWithPlans();
    const text = prose(1).repeat(5) + 'Thorne knew the secret without reading the sealed letter.';
    const candidate = addCandidate(run.chapters[0], text, 'draft');
    const llm = vi.fn(async (prompt: string) => {
      expect(prompt).toContain(text);
      expect(prompt).toContain('before learning it');
      return JSON.stringify({ issues: [{ id: 'knowledge-leak', category: 'knowledge', severity: 'critical', description: 'No acquisition supports this knowledge.', instruction: 'Establish acquisition before the action.', evidence: [{ chapter: 1, revision: 1, quote: 'Thorne knew the secret without reading the sealed letter.' }] }] });
    });
    expect((await reviewChapter(run, run.chapters[0], candidate, llm)).status).toBe('failed');
  });
  it('blocks unfilled slots and incomplete prose even when the LLM reports no defects', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], 'Thorne [DIALOGUE_1]', 'draft');
    const result = await reviewChapter(run, run.chapters[0], candidate, async () => '{"issues":[]}');
    expect(result.status).toBe('failed');
    expect(result.issues.map(issue => issue.id)).toContain('unfilled-slot');
    expect(result.issues.map(issue => issue.id)).toContain('incomplete-length');
  });
  it('rejects specialist output with missing required content', async () => {
    const run = runWithPlans(); run.spec.writingMode = 'slots';
    // The specialist step now retries, so the empty contribution must persist across both attempts.
    const llm = vi.fn().mockResolvedValueOnce('{"framework":"Thorne said [DIALOGUE_1]","slots":[{"id":"DIALOGUE_1","purpose":"reveal","participants":["Thorne"]}]}').mockResolvedValue('{"content":{}}');
    await expect(writeScene(run, run.chapters[0], 0, llm)).rejects.toThrow('Missing required slot');
  });
});

describe('Redundancy repair', () => {
  it('deletes numbered occurrences and rejects invalid IDs', async () => {
    const run = runWithPlans();
    const echoed = 'She kept the letter folded in her pocket while the clerk read the register.';
    const original = prose(1).replace(' The price', '\n\nThe price');
    const draft = `${original} ${echoed}`;
    const base = fixtureLLM();
    let reviewed = 0;
    let asked = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('never write prose')) {
        asked++;
        // Reject an out-of-range ID, then select the final repeated occurrence.
        return asked === 1
          ? JSON.stringify({ delete: [99999] })
          : JSON.stringify({ delete: [draft.split(/(?<=[.!?…])\s+/).length] });
      }
      if (system.includes('single prose writer') && /CHAPTER 1 OF/.test(prompt)) return JSON.stringify({ prose: draft });
      if (system.includes('continuity and developmental') && ++reviewed === 1) return '{"issues":[]}';
      return base(prompt, system, options);
    });

    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    expect(asked).toBe(2);
    const accepted = acceptedVersion(run.chapters[0])?.content ?? '';
    // The application did the cutting, so nothing arrived that the chapter did not already contain.
    expect(accepted).toBe(original);
    expect(accepted.split(echoed).length - 1).toBe(1);
  });
});

describe('Repair budget', () => {
  it('stops after five repairs leave the same finding unresolved', async () => {
    const run = runWithPlans();
    const base = fixtureLLM();
    let repairs = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) {
        repairs++;
        return JSON.stringify({ prose: `${prose(1)} Revision ${repairs} settled the matter.` });
      }
      if (system.includes('continuity and developmental')) return JSON.stringify({ issues: [{
        id: 'voice', category: 'voice', severity: 'major', description: 'The same unresolved defect.',
        instruction: 'Fix it.', evidence: [{ chapter: 1, revision: repairs + 1, quote: 'Thorne opened door 1.' }],
      }] });
      return base(prompt, system, options);
    });
    await expect(new NovelEngine(llm, new MemoryRunStore()).continue(run)).rejects.toThrow(/needs editorial attention/);
    expect(repairs).toBe(5);
    expect(run.chapters[0].status).toBe('needs_revision');
    expect(run.chapters[0].acceptedRevision).toBeUndefined();
    const engine = new NovelEngine(llm, new MemoryRunStore());
    // A passive resume must not silently spend another budget.
    await expect(engine.continue(run)).rejects.toThrow(/needs editorial attention/);
    expect(repairs).toBe(5);
    // Explicit retries get bounded cycles even after the lifetime history exceeds 14 versions.
    for (const total of [10, 15]) {
      await expect(engine.continue(run, { retry: true })).rejects.toThrow(/needs editorial attention/);
      expect(repairs).toBe(total);
      expect(run.chapters[0].versions).toHaveLength(total + 1);
      expect(run.chapters[0].acceptedRevision).toBeUndefined();
    }
  });

  it('spends the budget on rounds that face the same findings, not on rounds that fix something', async () => {
    const run = runWithPlans();
    const base = fixtureLLM();
    let reviewed = 0;
    let repairs = 0;
    const issue = (description: string) => JSON.stringify({ issues: [{
      id: 'voice', category: 'voice', severity: 'major', description,
      instruction: 'Fix it.', evidence: [{ chapter: 1, revision: 1, quote: 'Thorne opened door 1.' }],
    }] });

    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) { repairs++; return JSON.stringify({ prose: `${prose(1)} Revision ${repairs} settled the matter.` }); }
      if (system.includes('continuity and developmental')) {
        reviewed++;
        // Seven rounds, each answering the last and raising something new, then a clean chapter.
        return reviewed <= 7 ? issue(`Defect number ${reviewed}.`) : '{"issues":[]}';
      }
      return base(prompt, system, options);
    });

    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    // Seven repairs is past the five-round budget, and none of them were stuck.
    expect(repairs).toBe(7);
    expect(run.chapters[0].repairAttempts).toBe(0);
    expect(run.stage).toBe('complete');
  });
});

describe('Deletion arithmetic', () => {
  it('keeps one copy of a sentence the chapter says twice, and removes a unique one outright', async () => {
    const run = runWithPlans();
    const echoed = 'She kept the letter folded in her pocket while the clerk read the register.';
    const unique = 'The price was hers to pay.';
    const draft = `${prose(1)} ${echoed}`;
    const base = fixtureLLM();
    let reviewed = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('never write prose')) return JSON.stringify({ delete: draft.split(/(?<=[.!?…])\s+/).flatMap((text, index) => text === echoed || text === unique ? [index + 1] : []) });
      if (system.includes('single prose writer') && /CHAPTER 1 OF/.test(prompt)) return JSON.stringify({ prose: draft });
      if (system.includes('continuity and developmental') && ++reviewed === 1) return '{"issues":[]}';
      return base(prompt, system, options);
    });

    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    const accepted = acceptedVersion(run.chapters[0])?.content ?? '';
    expect(accepted.split(echoed).length - 1).toBe(1);
    expect(accepted).not.toContain(unique);
  });
});

describe('Repair order', () => {
  it('deletes the repetition first even when other defects are reported alongside it', async () => {
    const run = runWithPlans();
    const echoed = 'She kept the letter folded in her pocket while the clerk read the register.';
    const draft = `${prose(1)} ${echoed}`;
    const base = fixtureLLM();
    let reviewed = 0;
    const systems: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      systems.push(system);
      if (system.includes('never write prose')) return JSON.stringify({ delete: [draft.split(/(?<=[.!?…])\s+/).length] });
      if (system.includes('single prose writer') && /CHAPTER 1 OF/.test(prompt)) return JSON.stringify({ prose: draft });
      if (system.includes('continuity and developmental') && ++reviewed === 1) {
        // Repetition beside an unrelated continuity defect: the mix a real chapter reports.
        return JSON.stringify({ issues: [
          { id: 'dup', category: 'pacing', severity: 'major', description: 'Two overlapping concluding sequences repeat the same beat.',
            instruction: 'Remove one.', evidence: [{ chapter: 1, revision: 1, quote: echoed }] },
          { id: 'note', category: 'plot', severity: 'major', description: 'A note appears on the counter without being placed there.',
            instruction: 'Establish the note.', evidence: [{ chapter: 1, revision: 1, quote: 'Thorne opened door 1.' }] },
        ] });
      }
      return base(prompt, system, options);
    });

    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    expect(systems.some(system => system.includes('never write prose'))).toBe(true);
    expect(systems.some(system => system.includes('targeted fiction revision'))).toBe(false);
  });
});

describe('Slot assembly seam', () => {
  it('tells the framework not to narrate what a slot writes and the synthesis to drop the duplicate', async () => {
    const run = runWithPlans(); run.spec.writingMode = 'slots';
    const prompts: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, system) => {
      prompts.push(prompt);
      if (system.includes('coherent scene framework')) return JSON.stringify({ framework: 'Thorne waited. [DIALOGUE_1] The clerk turned away.', slots: [{ id: 'DIALOGUE_1', purpose: 'the refusal', participants: ['Thorne'] }] });
      if (system.includes('scene contributions')) return JSON.stringify({ content: { DIALOGUE_1: '"No," said the clerk.' } });
      return JSON.stringify({ prose: 'Thorne waited. "No," said the clerk. The clerk turned away.' });
    });
    await writeScene(run, run.chapters[0], 0, llm);
    expect(prompts[0]).toContain('never narrate or summarize in the framework a beat that a slot will write');
    expect(prompts[0]).toContain('GENRE CRAFT');
    expect(prompts.at(-1)).toContain('must not narrate a moment twice');
    expect(prompts.at(-1)).toContain('must not summarize dialogue or action it has just dramatized');
  });
});

describe('Resumable production engine', () => {
  it('runs planning, scene writing, local and global gates through final export', async () => {
    const store = new MemoryRunStore();
    const run = createRun(createBookSpec('Recover a letter', 3, { writingMode: 'scenes', targetWordsPerChapter: 300, targetAudience: 'YA', tense: 'present' }), provider);
    const llm = fixtureLLM();
    const engine = new NovelEngine(llm, store);
    await engine.outline(run);
    await engine.continue(run);
    expect(run.stage).toBe('complete');
    expect(run.chapters.every(chapter => acceptedVersion(chapter)?.review?.status === 'passed')).toBe(true);
    expect(compileBook(run)).toContain('Thorne opened door 3.');
    expect(JSON.parse(metadata(run)).canon.promises).toHaveLength(2);
    expect((await store.load()).spec.targetAudience).toBe('YA');
    expect((llm as any).mock.calls.filter(([, system]: string[]) => !system.includes('extract evidence')).every(([prompt]: string[]) => prompt.includes('"tense": "present"'))).toBe(true);
  });
  it('resumes a saved candidate after failed review without skipping or regenerating it', async () => {
    const run = runWithPlans();
    const store = new MemoryRunStore();
    const normal = fixtureLLM();
    const failing: NovelLLM = async (prompt, system, options) => {
      if (system.includes('continuity and developmental')) throw new Error('review temporarily offline');
      return normal(prompt, system, options);
    };
    await expect(new NovelEngine(failing, store).continue(run)).rejects.toThrow(/editorial attention/);
    const restored = await store.load();
    expect(restored.stage).toBe('needs_revision');
    expect(restored.chapters[0].candidateRevision).toBe(1);
    expect(nextUnacceptedChapter(restored)?.number).toBe(1);
    const resumed = fixtureLLM();
    await new NovelEngine(resumed, store).continue(restored);
    expect(restored.stage).toBe('complete');
    expect(restored.chapters[0].versions).toHaveLength(1);
    expect((resumed as any).mock.calls.filter(([prompt, system]: string[]) => system.includes('single prose writer') && prompt.includes('CHAPTER 1 OF'))).toHaveLength(0);
  });
  it('gives every repair the chapter length contract so a revision cannot condense the book', async () => {
    const run = runWithPlans();
    const base = fixtureLLM();
    let reviewed = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('continuity and developmental') && ++reviewed === 1) {
        return JSON.stringify({ issues: [{ id: 'voice-1', category: 'voice', severity: 'major', description: 'The clerk sounds like Thorne.', instruction: 'Differentiate the clerk.', evidence: [{ chapter: 1, revision: 1, quote: 'The price was hers to pay.' }] }] });
      }
      // A repair that leaves the cited sentence untouched has not repaired anything.
      if (system.includes('targeted fiction revision')) return JSON.stringify({ prose: prose(1).replace('The price was hers to pay.', 'The clerk answered in his own clipped register.') });
      return base(prompt, system, options);
    });
    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    const repairs = (llm as any).mock.calls.filter(([, system]: string[]) => system.includes('targeted fiction revision'));
    expect(repairs).toHaveLength(1);
    expect(repairs[0][0]).toContain('at least 240 words');
    expect(repairs[0][0]).toContain('do not condense');
    // The cited passage must be the repair target, not a hint for a fresh rewrite of the chapter.
    expect(repairs[0][0]).toContain('Reproduce every other sentence unchanged');
    expect(repairs[0][0]).toContain('The price was hers to pay.');
  });
  it('keeps provider configuration frozen independently of later input mutation', async () => {
    const config = { ...provider };
    const run = createRun(createBookSpec('A letter', 3), config);
    config.ollamaModel = 'different';
    const store = new MemoryRunStore(); await store.save(run);
    run.provider.ollamaModel = 'mutated in memory';
    expect((await store.load()).provider.ollamaModel).toBe('fixture');
  });
  it('extracts JSON objects surrounded by conversational preamble and reasoning text', () => {
    const noisyText = `The user wants a JSON object with the schema:
{
  "centralConflict": "goal, opposition"
}
Here is the blueprint for your novel:
\`\`\`json
{
  "centralConflict": "Real conflict between Vera and the town memory",
  "protagonistChange": "She accepts the cost of truth",
  "endingPayoff": "The boat is restored",
  "characters": [{"name": "Vera", "description": "Archivist"}],
  "promises": [{"id": "letter", "description": "The truth", "setupChapter": 1, "payoffChapter": 3, "required": true}]
}
\`\`\`
I hope this helps!`;
    const parsed = parseObject(noisyText, ['centralConflict', 'characters', 'promises']);
    expect(parsed.centralConflict).toBe('Real conflict between Vera and the town memory');
    expect(parsed.characters[0].name).toBe('Vera');
  });
});

describe('Complete-run resume boundaries', () => {
  it('completes a twenty-chapter run with the required payoff in the actual final chapter', async () => {
    const run = runWithPlans(20);
    await new NovelEngine(fixtureLLM(20), new MemoryRunStore()).continue(run);
    expect(run.stage).toBe('complete');
    expect(run.chapters).toHaveLength(20);
    expect(run.canon.promises.find(item => item.kind === 'payoff')?.evidence.chapter).toBe(20);
    expect(compileBook(run)).toContain('Thorne opened door 20.');
  });

  it('resumes failed evidence extraction without rerunning an already validated chapter review', async () => {
    const run = runWithPlans();
    const base = fixtureLLM();
    const offline = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (system.includes('extract evidence')) throw new Error('temporary extraction outage');
      return base(prompt, system, options);
    });
    const store = new MemoryRunStore();
    await expect(new NovelEngine(offline, store).continue(run)).rejects.toThrow(/extraction outage/);
    expect(run.stage).toBe('needs_revision');
    expect(run.chapters[0].versions.at(-1)?.review?.status).toBe('passed');
    const resumed = await store.load();
    const online = fixtureLLM();
    await new NovelEngine(online, store).continue(resumed!);
    expect(resumed!.stage).toBe('complete');
    const reviews = vi.mocked(online).mock.calls.filter(([prompt, system]) => system.includes('continuity and developmental') && prompt.includes('REVIEW CHAPTER 1,'));
    expect(reviews).toHaveLength(0);
  });

  it('reuses grounded analysis when an invalidated chapter is byte-identical', async () => {
    const run = runWithPlans();
    [1, 2, 3].forEach(number => approve(run, number));
    const original = acceptedVersion(run.chapters[2])!;
    run.chapters[2].status = 'invalidated';
    const candidate = addCandidate(run.chapters[2], original.content, 'Revalidate after upstream revision');
    candidate.review = { validationVersion: 2, status: 'passed', issues: [], checkedRevision: candidate.revision };
    const llm = vi.fn(async () => { throw new Error('analysis should be reused'); });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, run.chapters[2], candidate);
    expect(run.chapters[2].acceptedRevision).toBe(candidate.revision);
    expect(candidate.analysis?.events[0].evidence.revision).toBe(candidate.revision);
    expect(llm).not.toHaveBeenCalled();
  });
});
