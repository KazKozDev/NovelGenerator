import { literaryResponse, stampLiterary } from './helpers/literaryFixture';
import { proseCraft, sceneWordTargets } from '../utils/novel/proseCraft';
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
  const run = createRun(createBookSpec('Recover a letter', count, { targetWordsPerChapter: 300, language: 'English' }), provider);
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
  stampLiterary(run, number, version);
  acceptCandidate(run, number);
  return version;
}

function fixtureLLM(count = 3): NovelLLM {
  return vi.fn(async (prompt: string, system: string) => {
    const literary = literaryResponse(prompt, system);
    if (literary !== undefined) return literary;
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
    stampLiterary(run, 1, version);
    acceptCandidate(run, 1);
    expect(run.chapters.map(item => item.status)).toEqual(['accepted', 'invalidated', 'invalidated']);
  });
  it('rechecks later chapters when the ending changes even if factual canon is unchanged', () => {
    const run = runWithPlans();
    [1, 2, 3].forEach(number => approve(run, number));
    run.finalReview = { status: 'passed', issues: [], checkedRevision: 0 };
    approve(run, 1, `${prose(1)} A quieter coda closed the hour.`);
    expect(run.chapters.map(chapter => chapter.status)).toEqual(['accepted', 'invalidated', 'invalidated']);
    expect(Object.keys(run.canon.summaries)).toEqual(['1']);
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

  it('rewrites instead of ending the run when deletion would take the whole chapter', async () => {
    const run = runWithPlans();
    const echoed = 'She kept the letter folded in her pocket while the clerk read the register.';
    const draft = `${prose(1)} ${echoed} ${echoed}`;
    const base = fixtureLLM();
    let reviewed = 0;
    let deletions = 0;
    let repairs = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      // The chosen deletion takes everything, so the deletion pass cannot repair this chapter.
      if (system.includes('never write prose')) {
        deletions++;
        return JSON.stringify({ delete: draft.split(/(?<=[.!?…])\s+/).map((_, index) => index + 1) });
      }
      if (system.includes('targeted fiction revision')) {
        repairs++;
        expect(prompt).toContain('A deletion pass could not repair this chapter');
        // The length contract must not demand the repeated material back.
        expect(prompt).toContain('must not be padded back');
        return JSON.stringify({ prose: prose(1) });
      }
      if (system.includes('single prose writer') && /CHAPTER 1 OF/.test(prompt)) return JSON.stringify({ prose: draft });
      if (system.includes('continuity and developmental') && ++reviewed === 1) return '{"issues":[]}';
      return base(prompt, system, options);
    });

    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    expect(deletions).toBe(1);
    expect(repairs).toBe(1);
    expect(acceptedVersion(run.chapters[0])?.content).toBe(prose(1));
  });
});

describe('A chapter is planned against the book', () => {
  const scene = (id: string, participants: string[], conflictCarriedBy?: string) => ({
    sceneId: id, location: 'house', participants, objective: 'Recover the letter', conflict: 'The clerk refuses',
    outcome: 'A choice is made', duration: 'an hour', mood: 'tense', keyMoments: ['the refusal'], narrativeWeight: 3,
    ...(conflictCarriedBy ? { conflictCarriedBy } : {}),
  });
  const plan = (title: string, scenes: object[]) => ({
    title, summary: `${title} summary`, sceneBreakdown: 'one', characterDevelopmentFocus: 'trust', plotAdvancement: 'the letter',
    timelineIndicators: 'evening', emotionalToneTension: 'tense', connectionToNextChapter: 'consequences', openingHook: 'a knock',
    chapterEnding: 'a door closes', moralDilemma: 'tell or hide', consequencesOfChoices: 'a cost', rhythmPacing: 'steady',
    tensionLevel: 5, detailedScenes: scenes,
  });
  const spec = createBookSpec('Recover a letter', 3);

  it('accepts a scene with nobody in it: a room after everyone has gone is a scene', () => {
    const empty = plan('The empty room', [scene('s1', ['Thorne'], 'solitude'), scene('s2', [], 'solitude')]);
    expect(validateChapterPlan(empty, spec).detailedScenes[1].participants).toEqual([]);
  });

  it('refuses to call a scene an exchange when nobody is there to speak', () => {
    const alone = plan('Alone', [scene('s1', ['Thorne'], 'speech')]);
    expect(() => validateChapterPlan(alone, spec)).toThrow(/at least two characters present to speak/);
  });

  it('does not demand speech of a single chapter: two participants can be a watcher and the watched', () => {
    const silent = plan('Silence', [scene('s1', ['Thorne', 'the clerk'], 'action'), scene('s2', ['Thorne', 'the clerk'], 'solitude')]);
    expect(validateChapterPlan(silent, spec).title).toBe('Silence');
  });

  it('leaves a genuinely solitary chapter alone', () => {
    const alone = plan('Alone', [scene('s1', ['Thorne'], 'solitude'), scene('s2', ['Thorne', 'the clerk'], 'action')]);
    expect(validateChapterPlan(alone, spec).title).toBe('Alone');
  });

  it('replans one chapter when no scene in the whole book is carried by speech', async () => {
    const run = runWithPlans();
    for (const item of [...run.blueprint!.chapters, ...run.chapters.map(chapter => chapter.plan)]) {
      item.detailedScenes = item.detailedScenes.map((item2: any, index: number) => ({ ...item2, participants: ['Thorne', 'the clerk'], conflictCarriedBy: index ? 'action' : 'solitude' }));
    }
    const spoken = plan('The clerk answers', [scene('s-new', ['Thorne', 'the clerk'], 'speech')]);
    const llm: NovelLLM = vi.fn(async (_prompt, system) => {
      if (system.includes('plan causally')) return JSON.stringify(spoken);
      throw new Error('Only the replanning call belongs here.');
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).speechSomewhere(run);
    const speaking = run.chapters.filter(chapter => chapter.plan.detailedScenes.some((item: any) => item.conflictCarriedBy === 'speech'));
    expect(speaking).toHaveLength(1);
    expect(run.blueprint!.chapters.some(item => item.detailedScenes.some((s2: any) => s2.conflictCarriedBy === 'speech'))).toBe(true);
    expect(speaking[0].planningNote).toBeUndefined();
  });

  it('records a note instead of losing the run when replanning cannot make anyone speak', async () => {
    const run = runWithPlans();
    for (const item of [...run.blueprint!.chapters, ...run.chapters.map(chapter => chapter.plan)]) {
      item.detailedScenes = item.detailedScenes.map((item2: any) => ({ ...item2, participants: ['Thorne', 'the clerk'], conflictCarriedBy: 'action' }));
    }
    const llm: NovelLLM = async () => { throw new Error('planner offline'); };
    await (new NovelEngine(llm, new MemoryRunStore()) as any).speechSomewhere(run);
    expect(run.chapters.some(chapter => chapter.planningNote?.includes('No scene in this book is carried by speech'))).toBe(true);
  });

  it('asks again with room to invent when the planner returns a copy of an earlier chapter', async () => {
    const run = createRun(createBookSpec('Recover a letter', 3, { targetWordsPerChapter: 300, language: 'English' }), provider);
    run.outline = 'Thorne recovers the letter and accepts the cost.';
    const base = fixtureLLM();
    const asks: { prompt: string; temperature?: number }[] = [];
    let planned = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (!system.includes('plan causally')) return base(prompt, system, options);
      asks.push({ prompt, temperature: options?.temperature });
      // Chapter two is planned once, then repeated for chapter three until the pointed re-ask arrives.
      const repeated = /still unpaid/.test(prompt) ? ++planned + 10 : 2;
      return JSON.stringify(plan(`Chapter ${repeated}`, [scene(`s${repeated}`, ['Thorne'], 'solitude')]));
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).plan(run);
    const titles = run.chapters.map(chapter => chapter.plan.title);
    expect(new Set(titles).size).toBe(3);
    // Chapters two and three both came back as copies, so both were asked again, pointedly.
    const pointed = asks.filter(ask => /still unpaid/.test(ask.prompt));
    expect(pointed).toHaveLength(2);
    // The generic retry lowers temperature; repetition needs the opposite.
    for (const ask of pointed) expect(ask.temperature).toBeGreaterThan(0.5);
  });

  it('says nothing about a book whose characters never share a scene', async () => {
    const run = runWithPlans();
    for (const item of [...run.blueprint!.chapters, ...run.chapters.map(chapter => chapter.plan)]) {
      item.detailedScenes = item.detailedScenes.map((item2: any) => ({ ...item2, participants: ['Thorne'], conflictCarriedBy: 'solitude' }));
    }
    const llm: NovelLLM = async () => { throw new Error('No call belongs in a solitary book.'); };
    await (new NovelEngine(llm, new MemoryRunStore()) as any).speechSomewhere(run);
    expect(run.chapters.every(chapter => chapter.planningNote === undefined)).toBe(true);
  });

  it('judges no plan made before scenes declared how their conflict is carried', () => {
    const legacy = plan('Legacy', [scene('s1', ['Thorne', 'the clerk']), scene('s2', ['Thorne', 'the clerk'])]);
    expect(validateChapterPlan(legacy, spec).title).toBe('Legacy');
  });

  it('rejects a plan that repeats an earlier chapter, by scenes or by title', () => {
    const first = validateChapterPlan(plan('Movement', [scene('s1', ['Thorne'], 'solitude')]), spec);
    expect(() => validateChapterPlan(plan('A different name', [scene('s1', ['Thorne'], 'solitude')]), spec, [first]))
      .toThrow(/repeats chapter 1/);
    expect(() => validateChapterPlan(plan('Movement', [scene('s9', ['Thorne'], 'solitude')]), spec, [first]))
      .toThrow(/repeats chapter 1/);
    expect(validateChapterPlan(plan('Second movement', [scene('s2', ['Thorne'], 'action')]), spec, [first]).title).toBe('Second movement');
  });
});

describe('Retrying a structured response', () => {
  it('retries colder after a malformed answer', async () => {
    const temperatures: (number | undefined)[] = [];
    const llm: NovelLLM = async (_prompt, _system, options) => {
      temperatures.push(options?.temperature);
      return temperatures.length === 1 ? '{"title":' : '{"title":"A name"}';
    };
    await structuredResponse('PROMPT', 'system', llm, ['title'], raw => raw.title as string, { temperature: 0.4 });
    expect(temperatures).toEqual([0.4, 0.1]);
  });

  it('retries hotter after being told it repeated itself', async () => {
    const temperatures: (number | undefined)[] = [];
    const llm: NovelLLM = async (_prompt, _system, options) => {
      temperatures.push(options?.temperature);
      return '{"title":"A name"}';
    };
    let seen = 0;
    await structuredResponse('PROMPT', 'system', llm, ['title'], raw => {
      if (++seen === 1) throw new Error('This plan repeats chapter 2.');
      return raw.title as string;
    }, { temperature: 0.4 });
    expect(temperatures[1]).toBeGreaterThan(0.5);
  });
});

describe('A review is allowed to find nothing', () => {
  it('tells the editor that an empty report is a complete review, and refuses the suggestion shape', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], prose(1), 'draft');
    let seen = '';
    await reviewChapter(run, run.chapters[0], candidate, async (prompt) => { seen = prompt; return '{"issues":[]}'; });
    expect(seen).toContain('An empty issues array is the expected result');
    expect(seen).toContain('this review does not collect suggestions');
    // The checked dimensions are where to look, not a quota to fill.
    expect(seen).toContain('not a list to fill');
  });

  it('asks a short chapter for its missing beats, not for more words', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], 'Короткая глава.', 'draft');
    const report = await reviewChapter(run, run.chapters[0], candidate, async () => '{"issues":[]}');
    const short = report.issues.find(issue => issue.id === 'incomplete-length');
    expect(short?.instruction).toContain('named but never dramatized');
    expect(short?.instruction).toContain(run.chapters[0].plan.detailedScenes[0].keyMoments[0]);
    expect(short?.instruction).toContain('is the consequence of putting the missing beats on the page, not the goal');
  });

  it('tells the editor the premise is established ground, not a knowledge violation', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], prose(1), 'draft');
    let seen = '';
    await reviewChapter(run, run.chapters[0], candidate, async prompt => { seen = prompt; return '{"issues":[]}'; });
    // A live review flagged a sentence lifted from the author's own premise as a knowledge leak.
    expect(seen).toContain('the premise in the author contract above is established ground');
    expect(seen).toContain('repeating it is never a violation');
  });

  it('discards a finding whose own quoted subject is not in the prose', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], prose(1), 'draft');
    const quote = prose(1).slice(0, 60);
    const issue = (description: string) => JSON.stringify({ issues: [{ id: 'knowledge-01', category: 'knowledge', severity: 'major', description, instruction: 'Remove it.', evidence: [{ chapter: 1, revision: 1, quote }] }] });

    // The name was deleted revisions ago; the citation is real but has nothing to do with the claim.
    const stale = await reviewChapter(run, run.chapters[0], candidate, async () => issue('The protagonist uses the name «Игорь» which the story has not established.'));
    expect(stale.issues).toEqual([]);
    expect(stale.status).toBe('not_checked');

    // A finding whose quoted subject really is in the prose survives untouched.
    const real = await reviewChapter(run, run.chapters[0], candidate, async () => issue(`The prose leans on «${prose(1).split(' ')[1]}» without establishing it.`));
    expect(real.issues.map(item => item.id)).toEqual(['knowledge-01']);
  });

  it('passes a chapter the editor found nothing wrong with', async () => {
    const run = runWithPlans();
    const candidate = addCandidate(run.chapters[0], prose(1), 'draft');
    const report = await reviewChapter(run, run.chapters[0], candidate, async () => '{"issues":[]}');
    expect(report.status).toBe('passed');
    expect(report.issues).toEqual([]);
  });
});

describe('Prose that will not fit in a JSON string', () => {
  it('asks for the prose alone when the envelope comes back unterminated, and keeps the same checks', async () => {
    const story = 'Марина открыла дверь. За порогом никого не было.';
    const asks: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt) => {
      asks.push(prompt);
      // Both envelope attempts end mid-string, exactly as three live runs did.
      if (/field "prose"/.test(prompt)) return `{"prose":"${story.slice(0, 20)}`;
      return `\`\`\`\n${story}\n\`\`\``;
    });
    expect(await generateProse(llm, 'WRITE THE SCENE', 'You are the single prose writer for this novel.')).toBe(story);
    expect(asks).toHaveLength(3);
    expect(asks.at(-1)).toContain('Return the finished literary prose itself and nothing else');
  });

  it('still refuses prose that carries thinking markup, however it arrived', async () => {
    const llm: NovelLLM = async (prompt) => /field "prose"/.test(prompt) ? '{"prose":"unterminated' : '<think>plotting</think> Марина ушла.';
    await expect(generateProse(llm, 'WRITE THE SCENE', 'writer')).rejects.toThrow(/Thinking markup/);
  });

  it('does not reach for the fallback when the model simply returned nothing usable', async () => {
    let calls = 0;
    const llm: NovelLLM = async () => { calls++; return '{"prose":""}'; };
    await expect(generateProse(llm, 'WRITE THE SCENE', 'writer')).rejects.toThrow(/Missing final prose/);
    expect(calls).toBe(2);
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

describe('First-draft prose context', () => {
  it('allocates more space to decisive scenes and preserves the total after rounding', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const scene = chapter.plan.detailedScenes![0];
    chapter.plan.detailedScenes = [1, 4, 1].map((weight, index) => ({ ...scene, sceneId: `scene-${index}`, narrativeWeight: weight }));
    chapter.plan.targetWordCount = 1001;
    const targets = sceneWordTargets(chapter, 300);
    expect(targets).toEqual([167, 667, 167]);
    expect(targets.reduce((a, b) => a + b, 0)).toBe(1001);
    chapter.plan.detailedScenes.forEach(scene => delete scene.narrativeWeight);
    expect(sceneWordTargets(chapter, 300)).toEqual([334, 334, 333]);
  });

  it('rejects invalid scene weights while accepting saved plans without them', () => {
    const run = runWithPlans();
    const value = plan(1);
    expect(() => validateChapterPlan(value, run.spec)).not.toThrow();
    Object.assign(value.detailedScenes[0], { narrativeWeight: 0 });
    expect(() => validateChapterPlan(value, run.spec)).toThrow(/narrativeWeight/);
  });

  it('uses bounded accepted excerpts without leaking candidate or future prose', () => {
    const run = runWithPlans(4);
    approve(run, 1, 'FIRST_ACCEPTED ' + 'a'.repeat(9000) + ' FIRST_END');
    approve(run, 2, 'RECENT_ACCEPTED ' + 'b'.repeat(9000) + ' RECENT_END');
    addCandidate(run.chapters[1], 'UNACCEPTED_SECRET', 'pending correction');
    addCandidate(run.chapters[3], 'FUTURE_SECRET', 'future draft');
    const context = proseCraft(run, run.chapters[2]);
    expect(context).toContain('FIRST_ACCEPTED');
    expect(context).not.toContain('UNACCEPTED_SECRET');
    expect(context).not.toContain('FUTURE_SECRET');
    expect(context.length).toBeLessThan(11000);
  });

  it('gives the next scene the events and the last words, not every finished scene in full', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const finished = `Начало сцены, которое не должно попасть в промпт. ${'Она ждала у окна и считала минуты. '.repeat(60)}Последние слова на странице.`;
    chapter.sceneDrafts = [finished];
    chapter.plan.detailedScenes = [chapter.plan.detailedScenes[0], { ...chapter.plan.detailedScenes[0], sceneId: 's2' }];
    let seen = '';
    await writeScene(run, chapter, 1, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Дальше.' }); });
    expect(seen).toContain('Последние слова на странице.');
    expect(seen).not.toContain('Начало сцены, которое не должно попасть в промпт.');
    expect(seen).toContain(chapter.plan.detailedScenes[0].outcome);
    expect(seen).toContain('must not be told again');
    // Exactly the tail travels, and no more: the scene's own middle never reaches the writer.
    expect(seen).toContain(finished.slice(-1200));
    expect(seen).not.toContain(finished.slice(-1300));
  });

  it('supplies cross-chapter prose to the writing call', async () => {
    const run = runWithPlans();
    approve(run, 1, 'An earlier accepted prose sample with a distinctive register.');
    const calls: string[] = [];
    const llm: NovelLLM = async (prompt) => {
      calls.push(prompt);
      return JSON.stringify({ prose: 'Thorne opened the door.' });
    };
    await writeScene(run, run.chapters[1], 0, llm);
    expect(calls.length).toBe(1);
    for (const prompt of calls) expect(prompt).toContain('An earlier accepted prose sample with a distinctive register.');
  });
});

describe('Resumable production engine', () => {
  it('runs planning, scene writing, local and global gates through final export', async () => {
    const store = new MemoryRunStore();
    const run = createRun(createBookSpec('Recover a letter', 3, { targetWordsPerChapter: 300, targetAudience: 'YA', tense: 'present' }), provider);
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
    // A voice defect is not missing content, so the repair must not be told to produce more words:
    // that demand is what earlier runs paid for in fresh description.
    expect(repairs[0][0]).not.toContain('at least 240 words');
    expect(repairs[0][0]).toContain('Do not add length either');
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
