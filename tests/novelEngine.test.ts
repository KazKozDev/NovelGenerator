import { literaryResponse, stampLiterary } from './helpers/literaryFixture';
import { manuscriptContract, proseCraft, sceneWordTargets } from '../utils/novel/proseCraft';
import { literaryIntentForScene, planForScene } from '../utils/novel/writer';
import { describe, expect, it, vi } from 'vitest';
import { createBookSpec, chapterRole, type ChapterRecord, type NovelRun } from '../utils/novel/contracts';
import { plannedBeatsFrom } from './beatStub';
import { apparatusResidue, castNotInOutline, compactPlanningContext, createRun, looseJoins, NovelEngine, nextSweep, unchanged, validateBlueprint, validateChapterPlan } from '../utils/novel/engine';
import { acceptCandidate, acceptedVersion, addCandidate, canonBefore, canonForPrompt, canonForScene, emptyStoryState, endingIssues, nextUnacceptedChapter, rebuildCanon, standingConditions } from '../utils/novel/storyState';
import { alreadyExplained, analyseChapter, beatCoverageIssue, characterLimits, viewpointQuestion, copiedFromEarlier, demoteHedgedKnowledge, demoteSuggestions, generateProse, replayedBeats, restatedFromEarlierScenes, parseObject, reviewChapter, structuredResponse, type NovelLLM } from '../utils/novel/review';
import { MemoryRunStore } from '../utils/novel/runStore';
import { compileBook, metadata } from '../utils/novel/presentation';
import { writeScene } from '../utils/novel/writer';
import { journalSoFar, quotedFrom, readSceneJournal } from '../utils/novel/sceneJournal';
import { sceneCountGuidance } from '../utils/novel/proseCraft';

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

// Every chapter gets its own wording. Chapters built from one shared block of filler are chapters
// that copy each other sentence for sentence, which is the defect copied-passage exists to report.
const filler = (number: number) => FILLER.split(' ').map((word, index) => index % 4 === 1 ? `${word}${number}` : word).join(' ');
const prose = (number: number) => `Thorne opened door ${number}. ${filler(number)} The price was hers to pay.`;
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
  return { centralConflict: 'Recover the letter at a cost', protagonistChange: 'Accept responsibility', endingPayoff: 'Pay the price', characters: [{ name: 'Thorne', description: 'A guarded archivist whose clipped speech hides guilt.' }], promises: [{ id: 'letter', description: 'The letter must be recovered at a price', setupChapter: 1, payoffChapter: count, required: true }],
    climax: { decisiveAction: 'Thorne takes the letter back and gives up the post she kept it for.', preparedBy: ['letter'] } };
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
    if (system.includes('novel blueprint')) return JSON.stringify(blueprint(count));
    if (system.includes('plan causally')) return JSON.stringify(plan(Number(prompt.match(/Plan chapter (\d+)/)?.[1])));
    if (system.includes('single prose writer')) return JSON.stringify({ prose: prose(Number(prompt.match(/CHAPTER (\d+) OF/)?.[1])) });
    if (system.includes('continuity and developmental') || system.includes('complete novel through')) return '{"issues":[]}';
    if (system.includes('extract evidence')) {
      const number = Number(prompt.match(/chapter=(\d+)/)?.[1]);
      const revision = Number(prompt.match(/revision=(\d+)/)?.[1]);
      const evidence = { chapter: number, revision, quote: `Thorne opened door ${number}.` };
      return JSON.stringify({ conditions: [], beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence })), summary: `Thorne opened door ${number} and paid the price.`, facts: [{ id: `door-${number}`, subject: 'Thorne', predicate: 'location', value: `door ${number}`, knownBy: ['Thorne'], evidence }], events: [{ id: `event-${number}`, description: 'Thorne chose to act', consequences: ['Paid a price'], evidence }], promises: number === 1 ? [{ promiseId: 'letter', kind: 'setup', evidence }] : number === count ? [{ promiseId: 'letter', kind: 'payoff', evidence }] : [] });
    }
    if (system.includes('continuity record')) {
      const written = prompt.split('AS WRITTEN:\n')[1] || '';
      return JSON.stringify({ notes: [{ kind: 'event', note: 'A door was opened.', quote: written.split(/(?<=[.!?…])\s+/)[0] }] });
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
  it('leaves later chapters alone when a repair changed the wording but not what the chapter establishes', () => {
    const run = runWithPlans();
    [1, 2, 3].forEach(number => approve(run, number));
    const first = acceptedVersion(run.chapters[0])!;
    // A repair at the opening of chapter one: different sentences, the same events, the same last words.
    approve(run, 1, prose(1).replace('Thorne opened door 1.', 'Thorne opened the first of the doors.'));
    const endingNow = acceptedVersion(run.chapters[0])!.literary!.observations.find(item => item.kind === 'ending')!.evidence[0].quote;
    expect(endingNow).toBe(first.literary!.observations.find(item => item.kind === 'ending')!.evidence[0].quote);
    expect(run.chapters.map(chapter => chapter.status)).toEqual(['accepted', 'accepted', 'accepted']);
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
    const echoed = filler(1).split(/(?<=[.!?…])\s+/)[0];
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
    const echoed = filler(1).split(/(?<=[.!?…])\s+/)[0];
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

describe('A book is planned to cost something and to win the ending with what it prepared', () => {
  const spec = createBookSpec('Recover a letter', 3);
  const arc = (chapter: number, cost: string) => ({
    chapter, cost, structuralRole: 'develop', entryState: 'in the archive', causalLink: 'after the refusal',
    protagonistStrategy: 'press the clerk', development: 'the refusal hardens', internalDevelopment: 'doubt',
    chapterChange: 'the letter moves', exitState: 'the drawer is locked', endingFunction: 'consequence',
    pacingPriority: 'the refusal', setupPromiseIds: [], payoffPromiseIds: [],
  });
  const book = (extra: object = {}) => ({
    centralConflict: 'Recover the letter at a cost', protagonistChange: 'Accept responsibility', endingPayoff: 'Pay the price',
    characters: [{ name: 'Thorne', description: 'A guarded archivist.' }],
    promises: [
      { id: 'letter', description: 'The letter must be recovered at a price', setupChapter: 1, payoffChapter: 3, required: true },
      { id: 'key', description: 'The clerk keeps a second key', setupChapter: 3, payoffChapter: 3, required: false },
    ],
    climax: { decisiveAction: 'Thorne takes the letter back and loses the post she kept it for.', preparedBy: ['letter'] },
    ...extra,
  });

  it('allows one chapter that costs nothing, and refuses a book of them', () => {
    const one = book({ chapterArcs: [arc(1, 'her place on the register'), arc(2, ''), arc(3, 'the post itself')] });
    expect(validateBlueprint(one, spec).chapterArcs?.[1].cost).toBe('');
    const two = book({ chapterArcs: [arc(1, 'her place on the register'), arc(2, ''), arc(3, '')] });
    expect(() => validateBlueprint(two, spec)).toThrow(/cost the protagonist nothing/);
    // A book planned before arcs declared a cost declares none anywhere, and stays readable.
    const legacy = book({ chapterArcs: [arc(1, ''), arc(2, ''), arc(3, '')] });
    expect(validateBlueprint(legacy, spec).chapterArcs).toHaveLength(3);
  });

  it('keeps what a character cannot do, and asks the reviewer about it by name', () => {
    const limited = book({ characters: [
      { name: 'Thorne', description: 'A guarded archivist.', limits: ['will not let a death buy her the letter', '  ', 'will not let a death buy her the letter', 'cannot lift the drawer alone'] },
      { name: 'The clerk', description: 'Keeps the register.', limits: [] },
    ] });
    const blueprint = validateBlueprint(limited, spec);
    // Blank and duplicate entries are not limits; a character the design gave none carries none.
    expect(blueprint.characters.Thorne.limits).toEqual(['will not let a death buy her the letter', 'cannot lift the drawer alone']);
    expect(blueprint.characters['The clerk'].limits).toBeUndefined();
    const run = runWithPlans();
    run.blueprint = blueprint;
    const asked = characterLimits(run, run.chapters[0]);
    expect(asked).toContain('cannot lift the drawer alone');
    // The clerk is not in the chapter's scenes and has no limits; neither reaches the prompt.
    expect(asked).not.toContain('The clerk');
    // A book planned before the field existed is not judged against limits nobody wrote.
    const legacy = createRun(spec, provider);
    legacy.blueprint = validateBlueprint(book(), spec);
    expect(characterLimits(legacy, run.chapters[0])).toBe('');
  });

  it('reads a schedule the model quoted as strings, and stores it as numbers', () => {
    // Gemini returns "4" for an integer field often enough that a live book died on it: the schedule
    // was right and the type was wrong, and every === against a chapter number downstream needs the
    // number, so the coercion happens here or not at all.
    const quoted = book({
      promises: [
        { id: 'letter', description: 'The letter must surface', setupChapter: '1', payoffChapter: '3', required: 'true' },
      ],
      climax: { decisiveAction: 'Thorne gives up the post.', preparedBy: ['letter'] },
    });
    const blueprint = validateBlueprint(quoted, spec);
    expect(blueprint.promises[0]).toMatchObject({ setupChapter: 1, payoffChapter: 3, required: true });
  });

  it('says which promise is wrong and how, because that message is what the retry works from', () => {
    const late = book({ promises: [{ id: 'letter', description: 'x', setupChapter: 1, payoffChapter: 9, required: true }], climax: { decisiveAction: 'a', preparedBy: ['letter'] } });
    expect(() => validateBlueprint(late, spec)).toThrow(/pays off in chapter 9, but this book ends at chapter 3/);
    const backwards = book({ promises: [{ id: 'letter', description: 'x', setupChapter: 3, payoffChapter: 1, required: true }], climax: { decisiveAction: 'a', preparedBy: ['letter'] } });
    expect(() => validateBlueprint(backwards, spec)).toThrow(/before it is set up in chapter 3/);
    const open = book({ promises: [{ id: 'letter', description: 'x', setupChapter: 1, payoffChapter: null, required: true }], climax: { decisiveAction: 'a', preparedBy: ['letter'] } });
    expect(() => validateBlueprint(open, spec)).toThrow(/Only a promise with required=false may be left open/);
    const twin = book({ promises: [
      { id: 'letter', description: 'x', setupChapter: 1, payoffChapter: 3, required: true },
      { id: 'letter', description: 'y', setupChapter: 1, payoffChapter: 3, required: false },
    ], climax: { decisiveAction: 'a', preparedBy: ['letter'] } });
    expect(() => validateBlueprint(twin, spec)).toThrow(/share the id "letter"/);
  });

  it('refuses an ending won by something the book never set up', () => {
    expect(validateBlueprint(book(), spec).climax?.preparedBy).toEqual(['letter']);
    const invented = book({ climax: { decisiveAction: 'A stranger arrives with a duplicate.', preparedBy: ['duplicate'] } });
    expect(() => validateBlueprint(invented, spec)).toThrow(/not one of this book's promises/);
    // Declared, but first established in the chapter that spends it: the book handing itself the means.
    const late = book({ climax: { decisiveAction: 'Thorne opens the drawer with the second key.', preparedBy: ['key'] } });
    expect(() => validateBlueprint(late, spec)).toThrow(/not set up until chapter 3/);
  });

  it('refuses a book that will not say how it ends', () => {
    const { climax, ...silent } = book();
    expect(() => validateBlueprint(silent, spec)).toThrow(/what decisive action ends the book/);
    const unprepared = book({ climax: { decisiveAction: 'Thorne takes the letter back.', preparedBy: [] } });
    expect(() => validateBlueprint(unprepared, spec)).toThrow(/name the promises that prepare it/);
  });
});

describe('A chapter is planned against the book', () => {
  it('rejects a participant corrupted with generated prose', () => {
    const valid = runWithPlans(3).chapters[0].plan;
    expect(() => validateChapterPlan(valid, createBookSpec('A letter', 3), [], ['Thorne'])).not.toThrow();
    const corrupted = structuredClone(valid);
    corrupted.detailedScenes[0].participants = ['Thorne headlights of security vans approaching'];
    expect(() => validateChapterPlan(corrupted, createBookSpec('A letter', 3), [], ['Thorne'])).toThrow(/approved cast/);
  });

  it('keeps prior planning context bounded to outcomes rather than complete scene plans', () => {
    const run = runWithPlans(3);
    const context = JSON.stringify(compactPlanningContext(run));
    expect(context).not.toContain('keyMoments');
    expect(context).not.toContain('staging');
    expect(context).toContain('she pays the price');
  });
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

  it('puts right a scene that calls itself an exchange with nobody to speak to, and says it did', () => {
    const alone = plan('Alone', [scene('s1', ['Thorne'], 'speech')]);
    // Refusing cost a live book its run: the planner could read the message and still not answer it,
    // and of the two contradicting fields only one can be corrected without inventing a person.
    const fixed = validateChapterPlan(alone, spec);
    expect(fixed.detailedScenes[0].conflictCarriedBy).toBe('solitude');
    expect(fixed.normalizations?.[0]).toContain('Scene "s1" said its conflict is carried by speech with only "Thorne"');
    // A plan that is wrong about the book is still refused; only self-contradiction is put right.
    const stranger = plan('Stranger', [scene('s2', ['Thorne', 'a passing sailor'], 'speech')]);
    expect(() => validateChapterPlan(stranger, spec, [], ['Thorne'])).toThrow(/not in the approved cast/);
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

  it('asks once more, naming the scenes, when a plan gives every scene a costless ending', async () => {
    const run = createRun(createBookSpec('Recover a letter', 3, { targetWordsPerChapter: 300, language: 'English' }), provider);
    run.outline = 'Thorne recovers the letter and accepts the cost.';
    const base = fixtureLLM();
    const asks: string[] = [];
    // Each chapter gets its own scenes, or the twin check answers before this one does.
    let planned = 0;
    const costless = (n: number) => plan(`Chapter ${n}`, [
      { ...scene(`s${n}a`, ['Thorne'], 'solitude'), outcomeType: 'clean' },
      { ...scene(`s${n}b`, ['Thorne'], 'action'), outcomeType: 'clean' },
    ]);
    const paid = (n: number) => plan(`Chapter ${n}`, [
      { ...scene(`s${n}a`, ['Thorne'], 'solitude'), outcomeType: 'clean' },
      { ...scene(`s${n}b`, ['Thorne'], 'action'), outcomeType: 'setback' },
    ]);
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (!system.includes('plan causally')) return base(prompt, system, options);
      asks.push(prompt);
      // Every scene costless the first time, answered once it is told which scenes and what to do.
      if (/costs nothing/.test(prompt)) return JSON.stringify(paid(planned));
      planned++;
      return JSON.stringify(costless(planned));
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).plan(run);

    // Each chapter planned twice: refused, then told exactly what to change.
    expect(run.chapters).toHaveLength(3);
    expect(run.chapters.every(chapter => chapter.plan.detailedScenes.filter((item: any) => item.outcomeType === 'clean').length === 1)).toBe(true);
    const pointed = asks.filter(ask => /costs nothing/.test(ask));
    expect(pointed).toHaveLength(3);
    expect(pointed[0]).toContain('"s1a", "s1b" all end in a clean success');
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

  it('refuses a scene shape that names no dramatic structure, and keeps the one that does', () => {
    const known = plan('Shape', [{ ...scene('s1', ['Thorne'], 'solitude'), sceneShape: 'negotiation' }]);
    expect(validateChapterPlan(known, spec).detailedScenes[0].sceneShape).toBe('negotiation');
    // A near miss names a shape the list has; it is worth normalizing, not worth losing a plan over.
    const alias = plan('Alias', [{ ...scene('s1', ['Thorne'], 'solitude'), sceneShape: 'Interrogation' }]);
    expect(validateChapterPlan(alias, spec).detailedScenes[0].sceneShape).toBe('investigation');
    const invented = plan('Invented', [{ ...scene('s1', ['Thorne'], 'solitude'), sceneShape: 'a quiet talk' }]);
    expect(() => validateChapterPlan(invented, spec)).toThrow(/not one of/);
  });

  it('allows a chapter one scene that costs nothing, and no more', () => {
    const one = plan('One clean', [
      { ...scene('s1', ['Thorne'], 'solitude'), outcomeType: 'clean' },
      { ...scene('s2', ['Thorne'], 'action'), outcomeType: 'setback' },
    ]);
    expect(validateChapterPlan(one, spec).title).toBe('One clean');
    const two = plan('Two clean', [
      { ...scene('s1', ['Thorne'], 'solitude'), outcomeType: 'clean' },
      { ...scene('s2', ['Thorne'], 'action'), outcomeType: 'clean' },
    ]);
    // The refusal names the scenes, because the planner gets one pointed attempt on this message.
    expect(() => validateChapterPlan(two, spec)).toThrow(/Scenes "s1", "s2" all end in a clean success/);
    // A spelling of one of the three is read as that one; a fourth kind of ending is refused.
    const spelled = plan('Spelled', [{ ...scene('s1', ['Thorne'], 'solitude'), outcomeType: 'Costly Success' }]);
    expect(validateChapterPlan(spelled, spec).detailedScenes[0].outcomeType).toBe('costly-success');
    const invented = plan('Invented', [{ ...scene('s1', ['Thorne'], 'solitude'), outcomeType: 'happy' }]);
    expect(() => validateChapterPlan(invented, spec)).toThrow(/it must be one of/);
  });

  it('does not let a clean ending run across the chapter break', () => {
    const first = validateChapterPlan(plan('First', [{ ...scene('s1', ['Thorne'], 'solitude'), outcomeType: 'clean' }]), spec);
    const second = plan('Second', [{ ...scene('s2', ['Thorne'], 'action'), outcomeType: 'clean' }]);
    expect(() => validateChapterPlan(second, spec, [first])).toThrow(/already ended in a clean success/);
    const costly = plan('Second', [{ ...scene('s2', ['Thorne'], 'action'), outcomeType: 'costly-success' }]);
    expect(validateChapterPlan(costly, spec, [first]).title).toBe('Second');
  });

  it('refuses a shift that ends where it began, and a chapter that declares one for some scenes only', () => {
    const moving = (from: string, to: string) => ({ register: 'knowledge', from, to });
    const good = plan('Moves', [
      { ...scene('s1', ['Thorne'], 'solitude'), shift: moving('believes the clerk is honest', 'has seen the clerk take the money') },
      { ...scene('s2', ['Thorne'], 'action'), shift: moving('has seen the clerk take the money', 'has told no one and cannot prove it') },
    ]);
    expect(validateChapterPlan(good, spec).detailedScenes[1].shift.register).toBe('knowledge');
    const still = plan('Still', [{ ...scene('s1', ['Thorne'], 'solitude'), shift: moving('afraid', 'Afraid ') }]);
    expect(() => validateChapterPlan(still, spec)).toThrow(/ends where it began/);
    const partial = plan('Partial', [
      { ...scene('s1', ['Thorne'], 'solitude'), shift: moving('outside the archive', 'inside it') },
      scene('s2', ['Thorne'], 'action'),
    ]);
    expect(() => validateChapterPlan(partial, spec)).toThrow(/or none may/);
    const madeUp = plan('Made up', [{ ...scene('s1', ['Thorne'], 'solitude'), shift: { register: 'vibes', from: 'a', to: 'b' } }]);
    expect(() => validateChapterPlan(madeUp, spec)).toThrow(/shift register must be one of/);
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
    expect(seen).toContain('anything the author contract above already establishes are not leaks');
    // A final chapter stalled for four revisions on a revelation the earlier chapters had not planted:
    // nothing it can write will plant a clue in a chapter that is already accepted.
    expect(seen).toContain('is a defect of the book, not of this chapter');
  });

  it('keeps the scars it stopped arguing in words, as rules that run every time', () => {
    const leak = (quote: string) => ({ id: 'k', category: 'knowledge' as const, severity: 'critical' as const, description: 'Uses knowledge the story has not given.', instruction: 'Remove it.', evidence: [{ chapter: 1, revision: 1, quote }] });
    // The prompt used to spend 1800 characters arguing these two cases. They are checked here instead.
    expect(demoteHedgedKnowledge([leak('She could not place the smell, only that it belonged to somewhere else.')])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([leak('Он не мог вспомнить, где слышал это имя.')])[0].severity).toBe('minor');
    const wish = (description: string) => ({ id: 'w', category: 'pacing' as const, severity: 'major' as const, description, instruction: 'Rework it.', evidence: [{ chapter: 1, revision: 1, quote: 'q' }] });
    expect(demoteSuggestions([wish('The scene requires a smoother transition into the next.')])[0].severity).toBe('minor');
    expect(demoteSuggestions([wish('The passage risks breaking immersion.')])[0].severity).toBe('minor');
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

describe('A repair that changes nothing', () => {
  it('is asked again, and ends the budget if it changes nothing twice', async () => {
    const run = runWithPlans();
    const base = fixtureLLM();
    let reviewed = 0;
    let asked = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) {
        asked++;
        // Hand the chapter back exactly as it came, twice.
        return JSON.stringify({ prose: prose(1) });
      }
      if (system.includes('single prose writer') && /CHAPTER 1 OF/.test(prompt)) return JSON.stringify({ prose: prose(1) });
      if (system.includes('continuity and developmental')) {
        reviewed++;
        return JSON.stringify({ issues: [{ id: `canon-${reviewed}`, category: 'canon', severity: 'major', description: `Something differently worded each round, ${reviewed}.`, instruction: 'Change it.', evidence: [{ chapter: 1, revision: 1, quote: prose(1).slice(0, 40) }] }] });
      }
      return base(prompt, system, options);
    });
    await expect(new NovelEngine(llm, new MemoryRunStore()).continue(run)).rejects.toThrow(/returned the chapter unchanged/);
    // Asked twice for the same round, then stopped instead of spending fourteen versions on nothing.
    expect(asked).toBe(2);
    expect(run.chapters[0].versions.length).toBeLessThan(4);
    expect(run.chapters[0].status).toBe('needs_revision');
  });

  it('recognises a revision as unchanged only when every sentence matches', () => {
    expect(unchanged('Он вышел. Она осталась.', 'Он вышел.  Она осталась.')).toBe(true);
    expect(unchanged('Он вышел. Она осталась.', 'Он вышел. Она ушла.')).toBe(false);
    expect(unchanged('Он вышел.', 'Он вышел. Она осталась.')).toBe(false);
  });
});

describe('A defect that is a proportion, not a place', () => {
  const spread = (id: string, severity: 'critical' | 'major' | 'minor' = 'major') =>
    ({ id, category: 'voice' as const, severity, description: 'A share.', instruction: 'Fix it.', evidence: [] });

  it('sends one chapter-wide sweep per repair and keeps every finding about a place', () => {
    const issues = [spread('simile-density', 'minor'), { ...spread('knowledge-01'), category: 'knowledge' as const },
      spread('speech-tag-bloat'), spread('serial-explanation'), spread('adjective-stacking', 'minor')];
    const passed = nextSweep(issues).issues.map(issue => issue.id);
    // The most severe sweep goes first; the others come back next round, still measured.
    expect(passed).toEqual(['knowledge-01', 'speech-tag-bloat']);
  });

  it('gives each sweep a round instead of spending every round on the gravest one', () => {
    const issues = [spread('simile-density', 'minor'), spread('speech-tag-bloat'), spread('serial-explanation')];
    const first = nextSweep(issues, []);
    expect(first.issues.map(issue => issue.id)).toEqual(['speech-tag-bloat']);
    const second = nextSweep(issues, first.served);
    // The gravest sweep had its round; the next goes to one still waiting, not to the same measure again.
    expect(second.issues.map(issue => issue.id)).toEqual(['serial-explanation']);
    const third = nextSweep(issues, second.served);
    expect(third.issues.map(issue => issue.id)).toEqual(['simile-density']);
    // Every sweep has had a turn and all three are still measured: the rotation begins again.
    expect(nextSweep(issues, third.served).issues.map(issue => issue.id)).toEqual(['speech-tag-bloat']);
  });

  it('remembers a lone sweep, so a second one that appears later gets the next round', () => {
    const served = nextSweep([spread('speech-tag-bloat')], []).served;
    expect(served).toEqual(['speech-tag-bloat']);
    const issues = [spread('speech-tag-bloat'), spread('simile-density', 'minor')];
    expect(nextSweep(issues, served).issues.map(issue => issue.id)).toEqual(['simile-density']);
  });

  it('changes nothing when there is only one sweep to make', () => {
    const issues = [spread('simile-density'), { ...spread('knowledge-01'), category: 'knowledge' as const }];
    expect(nextSweep(issues).issues).toEqual(issues);
  });

  it('hands the repair this chapter\'s intent, not the book\'s whole literary ledger', async () => {
    const run = runWithPlans();
    approve(run, 1, 'An accepted chapter whose literary ledger must not travel into every later repair.');
    const chapter = run.chapters[1];
    chapter.literaryPlan = { version: 1, contextKey: 'k', chapterPlanKey: 'p', endingDevelopment: 'The ending turns.', avoidReplaying: [], scenes: [] };
    const version = addCandidate(chapter, prose(2), 'draft');
    let seen = '';
    await (new NovelEngine(async prompt => { seen = prompt; return JSON.stringify({ prose: prose(2) }); }, new MemoryRunStore()) as any)
      .repair(run, chapter, version, [{ id: 'knowledge-01', category: 'knowledge' as const, severity: 'major' as const, description: 'A leak.', instruction: 'Remove it.', evidence: [] }]);
    expect(seen).toContain('LITERARY INTENT FOR THIS CHAPTER');
    expect(seen).toContain('The ending turns.');
    expect(seen).not.toContain('LITERARY STATE AND INTENT');
  });

  it('lifts the leave-everything-else rule for the issues that describe a share of the chapter', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, prose(1), 'draft');
    const issue = (id: string) => ({ id, category: 'dialogue' as const, severity: 'major' as const, description: 'A share.', instruction: 'Fix it.', evidence: [{ chapter: 1, revision: version.revision, quote: prose(1).slice(0, 50) }] });
    let seen = '';
    const llm: NovelLLM = async prompt => { seen = prompt; return JSON.stringify({ prose: prose(1) }); };

    await (new NovelEngine(llm, new MemoryRunStore()) as any).repair(run, chapter, version, [issue('speech-tag-bloat')]);
    expect(seen).toContain('One exception, and only for these issues: speech-tag-bloat');
    expect(seen).toContain('change every line in the chapter that carries the same defect');

    // A finding about one place keeps the ordinary contract.
    await (new NovelEngine(llm, new MemoryRunStore()) as any).repair(run, chapter, version, [issue('knowledge-01')]);
    expect(seen).not.toContain('One exception');
    expect(seen).toContain('Reproduce every other sentence unchanged');
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
        id: 'canon', category: 'canon', severity: 'major', description: 'The same unresolved defect.',
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
      id: 'canon', category: 'canon', severity: 'major', description,
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
    const echoed = filler(1).split(/(?<=[.!?…])\s+/)[0];
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
    const echoed = filler(1).split(/(?<=[.!?…])\s+/)[0];
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

  it('reads a weight off the scale as the end it reaches for, and refuses one that is not a number', () => {
    const run = runWithPlans();
    const value = plan(1);
    expect(() => validateChapterPlan(value, run.spec)).not.toThrow();
    Object.assign(value.detailedScenes[0], { narrativeWeight: 0 });
    const clamped = validateChapterPlan(value, run.spec);
    expect(clamped.detailedScenes[0].narrativeWeight).toBe(1);
    expect(clamped.normalizations?.[0]).toContain('read as 1');
    Object.assign(value.detailedScenes[0], { narrativeWeight: 'heavy' });
    expect(() => validateChapterPlan(value, run.spec)).toThrow(/narrativeWeight as an integer/);
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
    // Two excerpts of at most 3000 characters each, plus the fixed craft and manuscript contract:
    // the number guards the excerpts against growing into the whole book, not the instructions. It
    // moved from 13500 when the contract took on the two-sentence negation and the character limits;
    // the excerpts it guards did not change, and what the instructions cost is visible in the diff.
    expect(context.length).toBeLessThan(14000);
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

  it('includes full chapter plan and continuation contract for the opening scene of a new chapter', async () => {
    const run = runWithPlans();
    const endingProse = 'Valeria locked the archive doors from outside and vanished into the rain.';
    approve(run, 1, `Opening scene of chapter one. Some middle paragraphs. ${endingProse}`);
    run.chapters[1].plan.title = 'The Midnight Safe';
    run.chapters[1].plan.openingHook = 'The streetlamp flickered in the cold drizzle.';
    let seen = '';
    await writeScene(run, run.chapters[1], 0, async prompt => {
      seen = prompt;
      return JSON.stringify({ prose: 'The rain continued.' });
    });
    // Check that chapter plan and openingHook are passed
    expect(seen).toContain('The Midnight Safe');
    expect(seen).toContain('The streetlamp flickered in the cold drizzle.');
    expect(seen).toContain('CHAPTER PLAN');
    // Check continuation contract from previous chapter's ending
    expect(seen).toContain('CONTINUATION FROM PREVIOUS CHAPTER (Chapter 1)');
    expect(seen).toContain(endingProse);
    expect(seen).toContain('DO NOT repeat the previous chapter\'s opening hook');
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

describe('The beat registry', () => {
  const beat = (sceneId: string, text: string, revision: number) =>
    ({ sceneId, beat: text, evidence: { chapter: 1, revision, quote: prose(1).slice(0, 24) } });

  it('records only the planned beats the extractor can cite, and drops one the plan never asked for', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, prose(1), 'fixture');
    const analysis = await analyseChapter(run, chapter, version, async (prompt: string) => {
      if (prompt.includes('TASK: Extract facts')) return '{"summary":"Thorne opened the door.","facts":[]}';
      if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
      if (prompt.includes('TASK: Extract promises')) return '{"promises":[]}';
      if (prompt.includes('TASK: Extract conditions')) return '{"conditions":[]}';
      const planned = plannedBeatsFrom(prompt);
      expect(planned).toEqual([{ sceneId: 'scene-1', beat: 'choice' }, { sceneId: 'scene-1', beat: 'consequence' }]);
      // The third entry names a beat no scene planned; it cannot be a planned beat that reached the page.
      return JSON.stringify({ beats: [...planned, { sceneId: 'scene-1', beat: 'a beat nobody planned' }].map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
    });
    expect(analysis.beats?.map(item => item.beat)).toEqual(['choice', 'consequence']);
  });

  it('carries the registry into canon, where the chapters that follow can read it', async () => {
    const run = runWithPlans();
    const version = approve(run, 1);
    version.analysis!.beats = [beat('scene-1', 'choice', version.revision)];
    run.canon = rebuildCanon(run.chapters);
    expect(run.canon.beats).toEqual([beat('scene-1', 'choice', version.revision)]);
    expect((canonForPrompt(run.canon) as { beats: unknown[] }).beats).toEqual([{ sceneId: 'scene-1', beat: 'choice' }]);
  });

  it('says nothing when one beat of several is unmatched, and speaks when a whole scene is silent', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, prose(1), 'fixture');
    const analysis = (beats: ReturnType<typeof beat>[]) => ({ summary: 's', facts: [], events: [], promises: [], beats });
    // Reworded on the page and unmatched by the extractor is the likelier reading of a single miss.
    chapter.plan.detailedScenes = [{ ...chapter.plan.detailedScenes![0], keyMoments: ['choice', 'consequence', 'cost'] }];
    expect(beatCoverageIssue(chapter, analysis([beat('scene-1', 'choice', version.revision), beat('scene-1', 'consequence', version.revision)]), version)).toBeUndefined();
    const issue = beatCoverageIssue(chapter, analysis([]), version);
    expect(issue?.id).toBe('undramatized-beat');
    expect(issue?.severity).toBe('major');
    expect(issue?.instruction).toContain('cost');
  });

  it('reports a scene that kept one beat of four, and stays quiet at two of three', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, prose(1), 'fixture');
    const analysis = (beats: ReturnType<typeof beat>[]) => ({ summary: 's', facts: [], events: [], promises: [], beats });
    // Measured on a live run: a confrontation planned in four beats reached the page as one, and the
    // chapter was accepted because a single survivor stopped the scene from counting as unwritten.
    chapter.plan.detailedScenes = [{ ...chapter.plan.detailedScenes![0], keyMoments: ['choice', 'consequence', 'cost', 'refusal'] }];
    expect(beatCoverageIssue(chapter, analysis([beat('scene-1', 'choice', version.revision)]), version)?.id).toBe('undramatized-beat');
    // Two of three is a scene written differently, not a scene missing.
    chapter.plan.detailedScenes = [{ ...chapter.plan.detailedScenes![0], keyMoments: ['choice', 'consequence', 'cost'] }];
    expect(beatCoverageIssue(chapter, analysis([beat('scene-1', 'choice', version.revision), beat('scene-1', 'consequence', version.revision)]), version)).toBeUndefined();
  });

  it('reads a missing registry as silence about the beats, not as beats that never reached the page', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, prose(1), 'fixture');
    expect(beatCoverageIssue(chapter, { summary: 's', facts: [], events: [], promises: [] }, version)).toBeUndefined();
  });

  it('sends a chapter whose planned scene was never written back to repair instead of accepting it', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const candidate = addCandidate(chapter, prose(1), 'fixture');
    candidate.review = { validationVersion: 2, status: 'passed', issues: [], checkedRevision: candidate.revision };
    stampLiterary(run, 1, candidate);
    const llm = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('extract evidence')) {
        // The extraction is clean and finds nothing of the planned scene: the scene was never written.
        return JSON.stringify({ summary: 'Thorne opened door 1.', facts: [], events: [], promises: [], beats: [], conditions: [] });
      }
      throw new Error(`repair reached: ${system}`);
    });
    await expect((new NovelEngine(llm as any, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate)).rejects.toThrow(/repair reached/);
    expect(chapter.status).not.toBe('accepted');
    expect(candidate.review!.issues.map(issue => issue.id)).toContain('undramatized-beat');
  });
});

describe('What a chapter has already put on the page', () => {
  it('outlives the chapter, and reaches the scenes of the chapters after it', async () => {
    const run = runWithPlans(3);
    const first = run.chapters[0];
    first.sceneJournal = [{ sceneId: 'scene-1', notes: [
      { kind: 'told', note: 'THE_ARCHIVE_ROOM_IS_DESCRIBED', quote: prose(1).slice(0, 20) },
      { kind: 'event', note: 'A door was opened.', quote: prose(1).slice(0, 20) },
    ] }];
    approve(run, 1);
    // The journal goes when the chapter is accepted; what it had already told does not.
    expect(first.sceneJournal).toBeUndefined();
    expect(first.alreadyTold).toEqual(['THE_ARCHIVE_ROOM_IS_DESCRIBED']);

    const second = run.chapters[1];
    let seen = '';
    await writeScene(run, second, 0, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Next.' }); });
    expect(seen).toContain('ALREADY GIVEN IN EARLIER CHAPTERS');
    expect(seen).toContain('THE_ARCHIVE_ROOM_IS_DESCRIBED');
  });
});

describe('A plan checked against the outline it came from, and against itself', () => {
  const arc = (chapter: number, entryState: string, exitState: string) => ({
    chapter, cost: 'a way back', structuralRole: 'develop', entryState, causalLink: 'after', protagonistStrategy: 'press',
    development: 'the refusal hardens', internalDevelopment: 'doubt', chapterChange: 'the letter moves', exitState,
    endingFunction: 'consequence', pacingPriority: 'the refusal', setupPromiseIds: [], payoffPromiseIds: [],
  });

  it('sees a chapter that starts where the previous one started, and one that starts from nowhere', () => {
    const copied = looseJoins([
      arc(1, 'Thorne is outside the archive with no letter', 'Thorne holds the letter and is seen taking it'),
      arc(2, 'Thorne is outside the archive with no letter', 'The clerk names his price'),
    ]);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ chapter: 2 });
    expect(copied[0].problem).toContain('same state chapter 1 started from');

    const jump = looseJoins([
      arc(1, 'Thorne waits outside the archive', 'Thorne holds the letter and the clerk has seen him'),
      arc(2, 'A harbour pilot inspects a damaged hull at dawn', 'The pilot signs the manifest'),
    ]);
    expect(jump).toHaveLength(1);
    expect(jump[0].problem).toContain('nothing in common');
  });

  it('says nothing about a join that meets', () => {
    expect(looseJoins([
      arc(1, 'Thorne waits outside the archive', 'Thorne holds the letter and the clerk has seen him'),
      arc(2, 'Thorne holds the letter the clerk saw him take', 'The clerk names his price'),
    ])).toEqual([]);
    expect(looseJoins([])).toEqual([]);
  });

  it('names the people the plan has and the outline never mentioned', () => {
    const outline = 'Thorne recovers the letter from the clerk and accepts the cost.';
    const cast = { 'Thorne': {}, 'the clerk': {}, 'Commodore Vale': {} };
    expect(castNotInOutline(cast, outline)).toEqual(['Commodore Vale']);
    // A full name shortened in the outline is the same person, not an invention.
    expect(castNotInOutline({ 'Elias Thorne': {} }, outline)).toEqual([]);
  });
});

describe('A review that is this chapter\'s and no other\'s', () => {
  it('asks the chapter what it undertook, in its own words', async () => {
    const run = runWithPlans(3);
    // The last chapter, where the fixture's promise is scheduled to be paid.
    const chapter = run.chapters[2];
    chapter.plan.detailedScenes = [{
      ...chapter.plan.detailedScenes![0],
      shift: { register: 'knowledge', from: 'believes the clerk is honest', to: 'has seen the clerk take the money' },
      outcomeType: 'setback',
    }];
    const candidate = addCandidate(chapter, prose(3), 'draft');
    let seen = '';
    await reviewChapter(run, chapter, candidate, async prompt => {
      if (prompt.includes('REVIEW CHAPTER')) seen = prompt;
      return '{"issues":[]}';
    });
    expect(seen).toContain('WHAT THIS CHAPTER UNDERTOOK');
    expect(seen).toContain('moves knowledge from "believes the clerk is honest" to "has seen the clerk take the money"');
    expect(seen).toContain('ends in failure that leaves the situation worse');
    // The whole book's schedule is context; what this chapter owes is a question.
    expect(seen).toContain('The promise "The letter must be recovered at a price" is paid off here.');
  });

  it('says nothing of the kind for a plan that declares no obligations', async () => {
    const run = runWithPlans(3);
    const chapter = run.chapters[0];
    run.blueprint!.promises = [];
    chapter.plan.detailedScenes = [{ ...chapter.plan.detailedScenes![0], shift: undefined, outcomeType: undefined }];
    const candidate = addCandidate(chapter, prose(1), 'draft');
    let seen = '';
    await reviewChapter(run, chapter, candidate, async prompt => {
      if (prompt.includes('REVIEW CHAPTER')) seen = prompt;
      return '{"issues":[]}';
    });
    expect(seen).not.toContain('WHAT THIS CHAPTER UNDERTOOK');
  });
});

describe('A chapter read against the one before it', () => {
  it('quotes the chapter under review, never the finished one, and runs once', async () => {
    const run = runWithPlans(3);
    approve(run, 1);
    const chapter = run.chapters[1];
    const candidate = addCandidate(chapter, prose(2), 'draft');
    let neighbourCalls = 0;
    const llm: NovelLLM = async prompt => {
      if (prompt.includes('AS ACCEPTED AND FINAL')) {
        neighbourCalls++;
        return JSON.stringify({ findings: [
          { question: 4, description: 'Thorne is barefoot here, and the previous chapter left him booted.', instruction: 'Keep the boots or take them off on the page.', quote: prose(2).slice(0, 40) },
          // Quoting the finished chapter instead: nothing can act on it, so it is dropped.
          { question: 2, description: 'The archive is described again.', instruction: 'Cut the description.', quote: prose(1).slice(0, 40) },
        ] });
      }
      return '{"issues":[]}';
    };
    const report = await reviewChapter(run, chapter, candidate, llm);
    expect(neighbourCalls).toBe(1);
    const against = report.issues.filter(issue => issue.id.startsWith('against-previous'));
    expect(against).toHaveLength(1);
    expect(against[0].description).toContain('Against chapter 1');
    expect(against[0].evidence[0].quote).toBe(prose(2).slice(0, 40));

    // A second review of the same chapter does not read the neighbour again: that is how a check
    // becomes a loop, and the marker is what stops it.
    const second = addCandidate(chapter, prose(2), 'repair');
    await reviewChapter(run, chapter, second, llm);
    expect(neighbourCalls).toBe(1);
  });

  it('says nothing for the first chapter, which has no chapter before it', async () => {
    const run = runWithPlans(3);
    const chapter = run.chapters[0];
    const candidate = addCandidate(chapter, prose(1), 'draft');
    const llm: NovelLLM = async prompt => {
      if (prompt.includes('AS ACCEPTED AND FINAL')) throw new Error('There is no chapter before the first.');
      return '{"issues":[]}';
    };
    const report = await reviewChapter(run, chapter, candidate, llm);
    expect(report.issues.filter(issue => issue.id.startsWith('against-previous'))).toEqual([]);
  });
});

describe('A beat the chapter plays twice', () => {
  const chapterProse = [
    'Clark could not find the core. Bruce held out his bare hand. "Use me." Clark took the wrist and fired, and the shot went wide.',
    'Clark could not fix his eyes on the aperture. Bruce crossed the last pace and raised his open palm. "That is the point." Clark took the wrist and fired, and this time it did not waver.',
  ].join('\n\n***\n\n');

  it('is reported with both stagings quoted, where the scene journal could not see it', async () => {
    const run = runWithPlans(3);
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, chapterProse, 'fixture');
    const llm: NovelLLM = async () => JSON.stringify({ replayed: [{
      beat: 'Bruce offers his hand and Clark fires',
      first: 'Bruce held out his bare hand.',
      second: 'Bruce crossed the last pace and raised his open palm.',
    }] });
    const issues = await replayedBeats(run, chapter, version, llm);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('pacing');
    expect(issues[0].severity).toBe('major');
    expect(issues[0].evidence.map(item => item.quote)).toEqual(['Bruce held out his bare hand.', 'Bruce crossed the last pace and raised his open palm.']);
  });

  it('is dropped when either staging cannot be quoted from the chapter', async () => {
    const run = runWithPlans(3);
    const chapter = run.chapters[0];
    const version = addCandidate(chapter, chapterProse, 'fixture');
    // One real passage and one composed: a repeat that can only show one occurrence is not a repeat.
    const halfQuoted: NovelLLM = async () => JSON.stringify({ replayed: [{
      beat: 'The offer', first: 'Bruce held out his bare hand.', second: 'Bruce offered his hand a second time.',
    }] });
    expect(await replayedBeats(run, chapter, version, halfQuoted)).toEqual([]);
    const empty: NovelLLM = async () => JSON.stringify({ replayed: [] });
    expect(await replayedBeats(run, chapter, version, empty)).toEqual([]);
  });
});

describe('A condition one chapter puts on the next', () => {
  const evidence = (chapter: number, revision: number) => ({ chapter, revision, quote: prose(chapter).slice(0, 24) });

  it('stays in force until a chapter can be quoted for lifting it', () => {
    const run = runWithPlans(3);
    const first = approve(run, 1);
    first.analysis!.conditions = [{ id: 'bridge', statement: 'The bridge out of the district is down.', evidence: evidence(1, first.revision) }];
    run.canon = rebuildCanon(run.chapters);
    expect(standingConditions(run.canon).map(item => item.id)).toEqual(['bridge']);

    // Chapter two says nothing about it: silence does not lift a condition.
    const second = approve(run, 2);
    run.canon = rebuildCanon(run.chapters);
    expect(standingConditions(run.canon).map(item => item.id)).toEqual(['bridge']);

    second.analysis!.conditions = [{ id: 'bridge-lifted', statement: 'The ferry crossing is opened in its place.', evidence: evidence(2, second.revision), lifts: 'bridge' }];
    run.canon = rebuildCanon(run.chapters);
    expect(standingConditions(run.canon)).toEqual([]);
    expect(run.canon.conditions[0].liftedIn).toBe(2);
    expect(run.canon.conditions[0].liftedBy).toEqual(evidence(2, second.revision));
  });

  it('is not lifted by a chapter naming a condition the book never set', () => {
    const run = runWithPlans(3);
    const first = approve(run, 1);
    first.analysis!.conditions = [{ id: 'bridge', statement: 'The bridge out of the district is down.', evidence: evidence(1, first.revision) }];
    const second = approve(run, 2);
    // Fail-closed: an invented target lifts nothing, and the real constraint keeps binding.
    second.analysis!.conditions = [{ id: 'x', statement: 'The road is clear now.', evidence: evidence(2, second.revision), lifts: 'a-condition-nobody-set' }];
    run.canon = rebuildCanon(run.chapters);
    expect(standingConditions(run.canon).map(item => item.id)).toEqual(['bridge']);
  });

  it('travels into the prompts that decide what happens next', () => {
    const run = runWithPlans(3);
    const first = approve(run, 1);
    first.analysis!.conditions = [{ id: 'key', statement: 'Nobody enters the archive without the clerk.', evidence: evidence(1, first.revision) }];
    run.canon = rebuildCanon(run.chapters);
    const forScene = JSON.stringify(canonForPrompt(run.canon));
    expect(forScene).toContain('Nobody enters the archive without the clerk');
    // The planner sees it too, or it plans the chapter that walks straight through it.
    expect(JSON.stringify(compactPlanningContext(run))).toContain('Nobody enters the archive without the clerk');
  });
});

describe('A passage carried out of an earlier chapter', () => {
  const line = 'Марина посмотрела на окно напротив и не увидела там ни света, ни силуэта, ни движения.';

  it('reports a sentence copied word for word, and stays silent on one merely reworded', () => {
    const earlier = [{ chapter: 1, revision: 1, content: `${line} Она закрыла дверь на два оборота и легла.` }];
    expect(copiedFromEarlier(`Ночь тянулась. ${line}`, earlier).map(item => item.source.chapter)).toEqual([1]);
    // A shorter earlier sentence grown longer here is a chapter reusing a formula, not copying a passage.
    const reworded = 'Марина посмотрела в сторону окна напротив и подумала, что света там не будет уже никогда.';
    expect(copiedFromEarlier(`Ночь тянулась. ${reworded}`, earlier)).toEqual([]);
    expect(copiedFromEarlier(`Ночь тянулась. ${line}`, [])).toEqual([]);
  });

  it('fails the chapter through review, quoting both chapters and naming which one is the writer\'s', async () => {
    const run = runWithPlans();
    const first = approve(run, 1, `${prose(1)} ${line}`);
    const chapter = run.chapters[1];
    const version = addCandidate(chapter, `${prose(2)} ${line}`, 'fixture');
    const result = await reviewChapter(run, chapter, version, async () => '{"issues":[]}');
    const issue = result.issues.find(item => item.id === 'copied-passage');
    expect(result.status).toBe('failed');
    expect(issue?.severity).toBe('critical');
    expect(issue?.description).toContain('chapter(s) 1');
    expect(issue?.instruction).toContain('Only the sentence from chapter 2');
    expect(issue?.evidence).toEqual([
      { chapter: 2, revision: version.revision, quote: line },
      { chapter: 1, revision: first.revision, quote: line },
    ]);
  });

  it('reads only accepted chapters, never a draft the book has not told', async () => {
    const run = runWithPlans();
    addCandidate(run.chapters[0], `${prose(1)} ${line}`, 'an unaccepted draft');
    const chapter = run.chapters[1];
    const version = addCandidate(chapter, `${prose(2)} ${line}`, 'fixture');
    const result = await reviewChapter(run, chapter, version, async () => '{"issues":[]}');
    expect(result.issues.some(item => item.id === 'copied-passage')).toBe(false);
  });
});

describe('The canon a scene is given', () => {
  const fact = (id: string, subject: string, value: string, chapter: number) =>
    ({ id, subject, predicate: 'status', value, knownBy: [subject], evidence: { chapter, revision: 1, quote: 'q' } });
  const bulk = (count: number, chapter: number) =>
    Array.from({ length: count }, (_, index) => fact(`f${chapter}-${index}`, `Stranger${index}`, `a fact long enough to weigh on a prompt, number ${index}`, chapter));

  it('hands over the whole ledger while it still fits in a prompt', () => {
    const state = { ...emptyStoryState(), facts: [fact('a', 'Thorne', 'at the door', 1), fact('b', 'Vera', 'gone', 1)] };
    expect(canonForScene(state, ['Thorne'], 3)).toEqual(canonForPrompt(state));
  });

  it('keeps the people in the scene and everything the previous chapter established', () => {
    const state = { ...emptyStoryState(), summaries: { 1: 'Chapter one.' },
      facts: [...bulk(120, 1), fact('thorne', 'Thorne', 'holds the letter', 1), fact('fresh', 'Nobody', 'happened just now', 4)] };
    const scoped = canonForScene(state, ['Thorne'], 5) as { facts: { id: string }[]; summaries: Record<number, string> };
    const ids = scoped.facts.map(item => item.id);
    expect(JSON.stringify(scoped).length).toBeLessThan(JSON.stringify(canonForPrompt(state)).length);
    expect(ids).toContain('thorne');
    // A scene follows from what just happened as often as from who is standing in it.
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('f1-7');
    // Summaries are the thread the book hangs on, and they are short. They are never cut.
    expect(scoped.summaries).toEqual({ 1: 'Chapter one.' });
  });

  it('keeps a fact that names the scene\'s people anywhere in it, not only as its subject', () => {
    const state = { ...emptyStoryState(), facts: [...bulk(120, 1),
      { ...fact('bond', 'Vera', 'relationship:Thorne is her debtor', 1) }] };
    const scoped = canonForScene(state, ['Thorne'], 5) as { facts: { id: string }[] };
    expect(scoped.facts.map(item => item.id)).toContain('bond');
  });
});

describe('A finding local repair cannot answer', () => {
  it('stops blocking after two attempts, and the chapter records what it could not fix', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const candidate = addCandidate(chapter, prose(1), 'fixture');
    let repairs = 0;
    const base = fixtureLLM();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) {
        repairs++;
        return JSON.stringify({ prose: `${prose(1)} Попытка ${repairs} ничего не изменила по существу.` });
      }
      if (system.includes('continuity and developmental')) return JSON.stringify({ issues: [{
        // The shape that cost two chapters a full budget each on a live run.
        id: 'knowledge-1', category: 'knowledge', severity: 'major',
        description: 'Алексей использует знание о точном механизме ускорения света, которого нет в тексте главы.',
        instruction: 'Убрать знание.', evidence: [{ chapter: 1, revision: 1, quote: prose(1).slice(0, 40) }],
      }] });
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate);
    expect(chapter.status).toBe('accepted');
    // Two repairs, where the same finding used to spend five and then fourteen versions.
    expect(repairs).toBeLessThanOrEqual(3);
    expect(chapter.planningNote).toContain('no local repair could answer');
    expect(chapter.unrepairable?.[0].category).toBe('knowledge');
  });
});

describe('A repair that returns the chapter unchanged twice', () => {
  it('records the findings as unanswerable and goes on, instead of ending the run', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const candidate = addCandidate(chapter, prose(1), 'fixture');
    const base = fixtureLLM();
    let reviewed = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      // The writer answers every request with the chapter exactly as it stands: it has nothing to
      // change, which is the same answer as failing twice.
      if (system.includes('targeted fiction revision')) return JSON.stringify({ prose: candidate.content });
      if (system.includes('continuity and developmental')) {
        reviewed++;
        return JSON.stringify({ issues: [{
          // knowledge blocks on sight, so the loop reaches the repair rather than accepting at once.
          id: 'knowledge-1', category: 'knowledge', severity: 'major',
          description: 'Алексей называет имя заказчика колонны, которое глава ему не давала.',
          instruction: 'Дать объяснение.', evidence: [{ chapter: 1, revision: 1, quote: prose(1).slice(0, 40) }],
        }] });
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate);
    expect(chapter.status).toBe('accepted');
    // Either route reaches the same place: two failed attempts, or two attempts that changed nothing.
    expect(chapter.planningNote).toMatch(/no local repair could answer|returned the chapter unchanged/);
    expect(chapter.unrepairable?.[0].category).toBe('knowledge');
    // One reading per revision. The prose never changed — the repair returned it verbatim — so there
    // was never a second text to judge, and asking again about the same words is how a chapter used to
    // spend thirteen calls a round on nothing.
    expect(reviewed).toBe(1);
  });

  it('demotes a stubborn heuristic repeated passage finding after repairs fail, accepting the chapter', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const candidate = addCandidate(chapter, prose(1), 'fixture');
    const base = fixtureLLM();
    let repairs = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) {
        repairs++;
        return JSON.stringify({ prose: `${candidate.content} Revision ${repairs}.` });
      }
      if (system.includes('continuity and developmental')) {
        return JSON.stringify({ issues: [{
          id: 'restated-passage', category: 'format', severity: 'critical',
          description: '1 paragraph(s) tell again a beat this chapter has already told.',
          instruction: 'Delete the weaker telling.', evidence: [{ chapter: 1, revision: 1, quote: prose(1).slice(0, 40) }],
        }] });
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate);
    expect(chapter.status).toBe('accepted');
    expect(repairs).toBeLessThanOrEqual(3);
    expect(chapter.planningNote).toContain('no local repair could answer');
    expect(chapter.unrepairable?.[0].id).toBe('restated-passage');
  });
});

describe('A repair that touches one passage', () => {
  it('changes the paragraph the finding names and leaves the chapter otherwise identical', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const original = `${prose(1)}\n\nThorne already knew the name of the clerk, though nobody had said it aloud.`;
    const candidate = addCandidate(chapter, original, 'fixture');
    const base = fixtureLLM();
    let wholeChapterRepairs = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision on named passages')) {
        // One passage was named, and the writer is given only that passage to answer.
        expect(prompt).toContain('Thorne already knew the name of the clerk');
        return JSON.stringify({ replacements: [{ id: 'f1', prose: 'Thorne guessed at the name of the clerk, and did not ask whether she was right about it.' }] });
      }
      if (system.includes('targeted fiction revision')) { wholeChapterRepairs++; return JSON.stringify({ prose: original }); }
      if (system.includes('continuity and developmental')) {
        // The finding stands while its passage is on the page, and goes when the passage does.
        return prompt.includes('already knew the name of the clerk') ? JSON.stringify({ issues: [{
          id: 'knowledge-1', category: 'knowledge', severity: 'major',
          description: 'Thorne uses the name of the clerk before the chapter gives it to her.',
          instruction: 'Take the knowledge away.',
          evidence: [{ chapter: 1, revision: 1, quote: 'Thorne already knew the name of the clerk' }],
        }] }) : '{"issues":[]}';
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate);
    const repaired = chapter.versions[chapter.versions.length - 1].content;
    expect(repaired).toContain('Thorne guessed at the name of the clerk');
    expect(repaired).not.toContain('already knew the name of the clerk');
    // The rest of the chapter is the same text, and the whole-chapter repair was never asked for.
    expect(repaired.startsWith(prose(1))).toBe(true);
    expect(wholeChapterRepairs).toBe(0);
  });
});

describe('A scene that tells again what an earlier scene told', () => {
  const first = 'She set the case down on the step and listened to the water for a long while. The keeper did not come out to meet her, and the light went round twice before the door opened at all.';

  it('is caught while it is still one scene, not after the chapter is finished', () => {
    const second = 'She set the case down on the step and listened to the water for a long while. Inside, the piano stood under a sheet nobody had lifted in six years.';
    const restated = restatedFromEarlierScenes(second, [first]);
    expect(restated).toHaveLength(1);
    expect(restated[0].sentence).toContain('listened to the water');
    // A scene that carries the chapter forward is not a restatement of it.
    expect(restatedFromEarlierScenes('Inside, the piano stood under a sheet nobody had lifted in six years, and the keeper would not say why today was different.', [first])).toEqual([]);
  });

  it('is written again once, and the second attempt is kept only if it repeats less', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [...chapter.plan.detailedScenes!, { ...chapter.plan.detailedScenes![0], sceneId: 'scene-1b' }];
    let scenes = 0;
    const base = fixtureLLM();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('single prose writer')) {
        scenes++;
        // First scene; then the same prose again; then, told what it repeated, something of its own.
        if (scenes === 1) return JSON.stringify({ prose: `${first} ${FILLER}` });
        if (scenes === 2) return JSON.stringify({ prose: `${first} ${FILLER}` });
        expect(prompt).toContain('told again what earlier scenes');
        return JSON.stringify({ prose: `Inside, the piano stood under a sheet nobody had lifted in six years. ${FILLER}` });
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).writeRemaining(run).catch(() => {});
    expect(scenes).toBe(3);
    expect(chapter.sceneDrafts?.[1]).toContain('under a sheet nobody had lifted');
    expect(chapter.sceneDrafts?.[1]).not.toContain('listened to the water');
  });
});

describe('The plan a scene is given', () => {
  it('carries this scene entire and its neighbours as a line each', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-a' },
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-b', objective: 'confront the clerk', outcome: 'the letter changes hands', keyMoments: ['the refusal', 'the price named'] },
    ];
    const plan = planForScene(chapter, 0) as { thisScene: { sceneId: string; keyMoments: string[] }; otherScenes: { sceneId: string; position: string; keyMoments?: string[] }[]; title: string };
    expect(plan.thisScene.sceneId).toBe('scene-a');
    expect(plan.thisScene.keyMoments.length).toBeGreaterThan(0);
    // The frame of the chapter stays; the other scene arrives as a line, without its beats.
    expect(plan.title).toBe(chapter.plan.title);
    expect(plan.otherScenes).toHaveLength(1);
    expect(plan.otherScenes[0]).toMatchObject({ sceneId: 'scene-b', position: 'later' });
    expect(plan.otherScenes[0].keyMoments).toBeUndefined();
  });

  it('carries the literary intent of this scene, not of every scene in the chapter', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.literaryPlan = {
      version: 1, contextKey: 'k', chapterPlanKey: 'p', endingDevelopment: 'A choice narrows what can happen next.',
      avoidReplaying: ['the same realization announced twice'],
      scenes: [
        { sceneId: 'scene-1', development: 'the intent of this scene', characterChoice: 'she stays', dramaticCost: 'she loses the train', narrativeWeight: 2 },
        { sceneId: 'scene-2', development: 'the intent of a scene not being written', characterChoice: 'he refuses', dramaticCost: 'the letter burns', narrativeWeight: 3 },
      ],
    };
    const intent = JSON.stringify(literaryIntentForScene(chapter, 'scene-1'));
    expect(intent).toContain('the intent of this scene');
    expect(intent).toContain('A choice narrows what can happen next');
    expect(intent).not.toContain('a scene not being written');
  });

  it('keeps the chapter\'s ending out of every scene but the one that ends it', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.chapterEnding = 'THE_CHOICE_IS_MADE';
    chapter.plan.connectionToNextChapter = 'WHAT_COMES_AFTER';
    chapter.plan.summary = 'HOW_THE_CHAPTER_GOES';
    chapter.plan.openingHook = 'THE_DOOR_IS_LOCKED';
    chapter.plan.detailedScenes = [
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-a' },
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-b', outcome: 'THE_LETTER_CHANGES_HANDS' },
    ];
    const first = JSON.stringify(planForScene(chapter, 0));
    expect(first).not.toContain('THE_CHOICE_IS_MADE');
    expect(first).not.toContain('WHAT_COMES_AFTER');
    expect(first).not.toContain('HOW_THE_CHAPTER_GOES');
    // Nor the outcome the later scene is being saved for; only that a scene follows this one.
    expect(first).not.toContain('THE_LETTER_CHANGES_HANDS');
    expect(first).toContain('scene-b');
    expect(first).toContain('THE_DOOR_IS_LOCKED');
    const last = JSON.stringify(planForScene(chapter, 1));
    expect(last).toContain('THE_CHOICE_IS_MADE');
    expect(last).toContain('WHAT_COMES_AFTER');
    // The opening hook belongs to the scene that opens the chapter, and the earlier scene, already
    // written, keeps its outcome: that is what happened, not what is still to come.
    expect(last).not.toContain('THE_DOOR_IS_LOCKED');
    expect(JSON.parse(last).otherScenes[0]).toMatchObject({ sceneId: 'scene-a', position: 'earlier' });
  });

  it('gives the ending development only to the scene that carries the ending', () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-a' },
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-b' },
    ];
    chapter.literaryPlan = {
      version: 1, contextKey: 'k', chapterPlanKey: 'p', endingDevelopment: 'HOW_THE_CHAPTER_LANDS',
      avoidReplaying: ['the same realization announced twice'],
      scenes: [
        { sceneId: 'scene-a', development: 'the first movement', characterChoice: 'she stays', dramaticCost: 'she loses the train', narrativeWeight: 2 },
        { sceneId: 'scene-b', development: 'the second movement', characterChoice: 'he refuses', dramaticCost: 'the letter burns', narrativeWeight: 3 },
      ],
    };
    expect(JSON.stringify(literaryIntentForScene(chapter, 'scene-a'))).not.toContain('HOW_THE_CHAPTER_LANDS');
    expect(JSON.stringify(literaryIntentForScene(chapter, 'scene-a'))).toContain('the same realization announced twice');
    expect(JSON.stringify(literaryIntentForScene(chapter, 'scene-b'))).toContain('HOW_THE_CHAPTER_LANDS');
  });
});

// A second scene for a chapter whose fixture prose is keyed by chapter number. Its sentences share
// little vocabulary with the filler, so the duplicate-passage measurement does not read the two
// scenes of one chapter as the same scene written twice.
const SECOND_SCENE = [
  'The clerk turned the key on it.',
  'A cart went past with nothing in it and nobody driving.',
  'Somebody upstairs pulled a shutter closed against the weather.',
  'She counted what was left in her purse and found it enough for the fare.',
  'The yard gate had been painted over so many times it no longer met its post.',
  'She went out that way and did not look back at the building.',
].join(' ');

describe('The journal a chapter keeps while it is written', () => {
  const scenePair = (chapter: ChapterRecord) => [
    { ...chapter.plan.detailedScenes![0], sceneId: 'scene-a' },
    { ...chapter.plan.detailedScenes![0], sceneId: 'scene-b' },
  ];

  it('records only notes whose quotation is in the scene', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const scene = 'The clerk put the letter in the drawer and turned the key.\n\nThorne left by the yard door.';
    const llm: NovelLLM = async () => JSON.stringify({ notes: [
      { kind: 'possession', note: 'The letter is in the clerk\'s drawer.', quote: 'put the letter in the drawer' },
      { kind: 'position', note: 'Thorne left through the yard.', quote: 'Thorne left by the yard\ndoor.' },
      { kind: 'knowledge', note: 'Thorne knows who wrote the letter.', quote: 'She recognized the hand at once.' },
      { kind: 'rumour', note: 'An unknown kind.', quote: 'turned the key' },
    ] });
    const journal = await readSceneJournal(run, chapter, 0, scene, llm);
    expect(journal.sceneId).toBe(chapter.plan.detailedScenes![0].sceneId);
    expect(journal.notes.map(note => note.kind)).toEqual(['possession', 'position']);
    // The quotation the scene never contained goes, and with it the fact nothing on the page supports.
    expect(JSON.stringify(journal.notes)).not.toContain('who wrote the letter');
    expect(quotedFrom('turned the key', scene)).toBe(true);
    expect(quotedFrom('turned the lock', scene)).toBe(false);
  });

  it('records the declared shift only when the scene can be quoted for it', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes![0].shift = { register: 'resource', from: 'Thorne holds the letter', to: 'the clerk has it locked away' };
    const scene = 'The clerk put the letter in the drawer and turned the key.';
    const answer = (shift: object) => JSON.stringify({
      notes: [{ kind: 'possession', note: 'The letter is in the drawer.', quote: 'put the letter in the drawer' }], shift,
    });

    const moved = await readSceneJournal(run, chapter, 0, scene, async () => answer({ happened: true, quote: 'put the letter in the drawer' }));
    expect(moved.shiftQuote).toBe('put the letter in the drawer');
    // Claimed, but with a passage the scene does not contain: the claim goes the way an invented note goes.
    const composed = await readSceneJournal(run, chapter, 0, scene, async () => answer({ happened: true, quote: 'She handed it across the counter.' }));
    expect(composed.shiftQuote).toBeUndefined();
    const admitted = await readSceneJournal(run, chapter, 0, scene, async () => answer({ happened: false, quote: '' }));
    expect(admitted.shiftQuote).toBeUndefined();
    // A scene that declared no shift has none to record, and the reading is unaffected.
    delete chapter.plan.detailedScenes![0].shift;
    const undeclared = await readSceneJournal(run, chapter, 0, scene, async () => answer({ happened: true, quote: 'put the letter in the drawer' }));
    expect(undeclared.shiftQuote).toBeUndefined();
    expect(undeclared.notes).toHaveLength(1);
  });

  it('reaches the next scene of the chapter, and the plan is only the fallback', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = scenePair(chapter);
    chapter.sceneDrafts = ['The clerk put the letter in the drawer.'];
    chapter.sceneJournal = [{ sceneId: 'scene-a', notes: [{ kind: 'possession', note: 'THE_CLERK_HOLDS_THE_LETTER', quote: 'put the letter in the drawer' }] }];
    let seen = '';
    await writeScene(run, chapter, 1, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Next.' }); });
    expect(seen).toContain('THE_CLERK_HOLDS_THE_LETTER');
    expect(seen).toContain('WHERE THIS CHAPTER STANDS');
    // With the page speaking for the written scene, its planned intention is not declared to have happened.
    expect(seen).not.toContain('must not be told again');

    chapter.sceneJournal = [];
    seen = '';
    await writeScene(run, chapter, 1, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Next.' }); });
    expect(seen).toContain('must not be told again');
    expect(seen).toContain(chapter.plan.detailedScenes[0].outcome);
    expect(journalSoFar(chapter, 1)).toEqual([]);
  });

  it('tells the next scene what has already been said, and hands it no line to echo', async () => {
    // The measured cause of scene repetition: 83% of the sentences a scene repeated matched prose the
    // writer had never seen, so the record of what is true was never going to stop it — only a record
    // of what has already been said can.
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = scenePair(chapter);
    chapter.sceneDrafts = ['The archive smelled of wet paper. The clerk put the letter in the drawer.'];
    chapter.sceneJournal = [{ sceneId: 'scene-a', notes: [
      { kind: 'told', note: 'THE_ARCHIVE_IS_DESCRIBED', quote: 'The archive smelled of wet paper.' },
      { kind: 'possession', note: 'THE_CLERK_HOLDS_THE_LETTER', quote: 'put the letter in the drawer' },
    ] }];
    let seen = '';
    await writeScene(run, chapter, 1, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Next.' }); });
    expect(seen).toContain('ALREADY ON THE PAGE, AND NOT YOURS TO WRITE AGAIN');
    expect(seen).toContain('THE_ARCHIVE_IS_DESCRIBED');
    expect(seen).toContain('THE_CLERK_HOLDS_THE_LETTER');
    // The quotation is how a note earned its place in the record, not material for the next writer.
    // The last words of the chapter still travel, so the sentence is checked where the notes are.
    const notes = seen.slice(seen.indexOf('WHERE THIS CHAPTER STANDS'), seen.indexOf('THE LAST WORDS CURRENTLY ON THE PAGE'));
    expect(notes).not.toContain('smelled of wet paper');
    expect(notes).not.toContain('put the letter in the drawer');
  });

  it('is kept per written scene while the chapter is a draft, and dropped when it is accepted', async () => {
    const store = new MemoryRunStore();
    const run = runWithPlans();
    run.chapters[0].plan.detailedScenes = scenePair(run.chapters[0]);
    const base = fixtureLLM();
    // The two scenes of chapter one need prose of their own; the fixture keys its prose by chapter.
    const llm = vi.fn(async (prompt: string, system: string, options?: any) => {
      if (system.includes('single prose writer') && /SCENE 2\/2/.test(prompt)) return JSON.stringify({ prose: SECOND_SCENE });
      return base(prompt, system, options);
    });
    await new NovelEngine(llm, store).continue(run);
    const journalled = (llm as any).mock.calls.filter((call: any[]) => String(call[1]).includes('continuity record'));
    // One reading per written scene: two in the first chapter, one in each of the others.
    expect(journalled.length).toBe(4);
    expect(run.chapters.every(chapter => chapter.status === 'accepted')).toBe(true);
    expect(run.chapters.every(chapter => chapter.sceneJournal === undefined)).toBe(true);
  });

  it('survives a reading the model cannot ground, without losing its place', async () => {
    const run = runWithPlans();
    run.chapters[0].plan.detailedScenes = scenePair(run.chapters[0]);
    const base = fixtureLLM();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('continuity record')) return JSON.stringify({ notes: [{ kind: 'event', note: 'Invented.', quote: 'A line this scene does not contain.' }] });
      if (system.includes('single prose writer') && /SCENE 2\/2/.test(prompt)) return JSON.stringify({ prose: SECOND_SCENE });
      return base(prompt, system, options);
    });
    await new NovelEngine(llm, new MemoryRunStore()).continue(run);
    expect(run.chapters[0].status).toBe('accepted');
  });
});

describe('How many scenes a chapter is planned in', () => {
  it('starts from the chapter\'s length and stays inside what a plan may contain', () => {
    expect(sceneCountGuidance(4000)).toContain('about 4 scenes');
    expect(sceneCountGuidance(4000)).toContain('800–1200 words');
    expect(sceneCountGuidance(1200)).toContain('about 1 scene for');
    expect(sceneCountGuidance(10000)).toContain('about 8 scenes');
  });

  it('reaches the planner', async () => {
    const run = createRun(createBookSpec('Recover a letter', 3, { targetWordsPerChapter: 4000, language: 'English' }), provider);
    run.outline = 'Thorne recovers the letter and accepts the cost.';
    run.stage = 'planning';
    let seen = '';
    const base = fixtureLLM();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('plan causally')) seen ||= prompt;
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).plan(run);
    expect(seen).toContain('about 4 scenes');
    expect(seen).not.toContain('Use 1–8 scenes');
  });
});

describe('The contract a scene is written to', () => {
  it('names the obligatory events, the stopping point and what is not yet disclosable', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-a', outcome: 'she pays the price' },
      { ...chapter.plan.detailedScenes![0], sceneId: 'scene-b' },
    ];
    let seen = '';
    await writeScene(run, chapter, 0, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Prose.' }); });
    expect(seen).toContain('WHAT THIS SCENE MUST PUT ON THE PAGE');
    expect(seen).toContain('recover letter');
    expect(seen).toContain('WHAT CHANGES BY THE END: she pays the price');
    expect(seen).toContain('WHERE THE SCENE STOPS');
    expect(seen).toContain('1 more scene of this chapter follows this one');
    // The outline is the planner's and the editor's; a scene writer that has it writes towards an
    // ending it has not reached, and the mechanical "every planned beat" order is gone with it.
    expect(seen).not.toContain(run.outline);
    expect(seen).not.toContain('Dramatize every planned beat');
    expect(seen).toContain('Recover the letter at a cost');
  });
});

describe('The five marks of a draft that shows how it was made', () => {
  it('reads the plan left standing on the page, and leaves prose that merely mentions a scene alone', () => {
    expect(apparatusResidue('Scene 3: the corridor.')).toEqual(['Scene 3: the corridor.']);
    expect(apparatusResidue('\u0421\u0446\u0435\u043d\u0430 2 \u2014 \u043e\u043d \u0432\u0445\u043e\u0434\u0438\u0442.')).toHaveLength(1);
    expect(apparatusResidue('The keyMoments were three.')).toHaveLength(1);
    expect(apparatusResidue('POV: Anna, evening.')).toHaveLength(1);
    expect(apparatusResidue('[TODO: name the street]')).toHaveLength(1);
    // Prose that says the word, or carries a number and a colon, is not a label.
    expect(apparatusResidue('The scene at the window had cost her three years.')).toEqual([]);
    expect(apparatusResidue('He counted them: four, and then a fifth.')).toEqual([]);
    expect(apparatusResidue('\u0421\u0446\u0435\u043d\u0430 \u0432 \u043e\u043a\u043d\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u043b\u0430\u0441\u044c \u043a\u0430\u0436\u0434\u044b\u0439 \u0432\u0435\u0447\u0435\u0440.')).toEqual([]);
  });

  it('binds tense, names, quantities, conditions and the negation formula in every prose call', () => {
    const contract = manuscriptContract('past');
    expect(contract).toContain('narrate in the past tense');
    expect(contract).toContain('slips into the present');
    expect(contract).toMatch(/Not X, but Y/);
    expect(contract).toMatch(/NAMES ARE SPELLED AS THE BOOK SPELLS THEM/);
    expect(contract).toMatch(/NUMBERS ATTACHED TO A PERSON OR AN INTERVAL/);
    expect(contract).toMatch(/PHYSICAL CONDITIONS PERSIST/);
    expect(manuscriptContract('present')).toContain('narrate in the present tense');
    // Prompt blocks stay English-only so the validator can read them.
    expect(contract).not.toMatch(/[\u0430-\u044f\u0451]/i);
    const run = runWithPlans();
    expect(proseCraft(run, run.chapters[0])).toContain('MANUSCRIPT CONTRACT');
  });

  it('sends a scene back once when the plan is standing on the page, and keeps only a clean rewrite', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    let scenes = 0;
    const base = fixtureLLM();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('single prose writer')) {
        scenes++;
        if (scenes === 1) return JSON.stringify({ prose: `Scene 1: the corridor.\n\n${FILLER}` });
        expect(prompt).toContain('left the planning apparatus standing on the page');
        return JSON.stringify({ prose: `She went down the corridor without the light. ${FILLER}` });
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).writeRemaining(run).catch(() => {});
    expect(scenes).toBe(2);
    expect(chapter.sceneDrafts?.[0]).not.toContain('Scene 1:');
  });

  it('gives the scene writer the spellings the book owns, and nothing to name a stranger by', async () => {
    const run = runWithPlans();
    let seen = '';
    await writeScene(run, run.chapters[0], 0, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Prose.' }); });
    expect(seen).toContain('EVERY NAME THIS BOOK OWNS');
    expect(seen).toContain('MANUSCRIPT CONTRACT');
    expect(seen).toContain(`Output only prose in the ${run.spec.tense} tense`);
  });
});

describe('A repair that breaks the prose open', () => {
  it('is refused, the previous text stands, and the next attempt is told what it did', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const candidate = addCandidate(chapter, `${prose(1)}\n\n"I will not," she said.`, 'fixture');
    const base = fixtureLLM();
    let attempts = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) {
        attempts++;
        // The first attempt does what a live repair did: cuts the body of a line and leaves its tail.
        if (attempts === 1) return JSON.stringify({ prose: `${prose(1)}\n\nnot," she said.` });
        expect(prompt).toContain('broken open');
        return JSON.stringify({ prose: `${prose(1)}\n\n"I will not," she said, and meant it.` });
      }
      if (system.includes('continuity and developmental')) {
        return prompt.includes('and meant it') ? '{"issues":[]}' : JSON.stringify({ issues: [{
          id: 'knowledge-1', category: 'knowledge', severity: 'major',
          description: 'Thorne names the clerk before the chapter gives the name to her.',
          instruction: 'Take the knowledge away.', evidence: [{ chapter: 1, revision: 1, quote: prose(1).slice(0, 40) }],
        }] });
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate);
    const accepted = acceptedVersion(chapter)!.content;
    // The damaged attempt never became a version, and the chapter it left behind is whole.
    expect(accepted).toContain('"I will not," she said, and meant it.');
    expect(accepted).not.toContain('not," she said.\n');
    expect(chapter.versions.some(version => version.content.includes('\n\nnot," she said.'))).toBe(false);
    // It is kept as a reason, not as prose.
    expect(chapter.rejectedRepairs?.[0].reason).toContain('broken open');
    expect(attempts).toBe(2);
  });
});

describe('A repair that twice takes the dialogue off the page', () => {
  it('does not end the run: the chapter stands on the prose it has and the finding turns advisory', async () => {
    const run = runWithPlans();
    const chapter = run.chapters[0];
    const spoken = `${prose(1)}\n\n"I will not," she said.\n\n"Then we are finished here," he answered.`;
    const candidate = addCandidate(chapter, spoken, 'fixture');
    const base = fixtureLLM();
    let attempts = 0;
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (system.includes('targeted fiction revision')) {
        attempts++;
        // Both attempts answer a knowledge finding by deleting the exchange, which nothing asked for.
        if (attempts === 2) expect(prompt).toContain('none of the findings asked for dialogue to be cut');
        return JSON.stringify({ prose: `${prose(1)} She said nothing at all.` });
      }
      if (system.includes('continuity and developmental')) {
        return JSON.stringify({ issues: [{
          id: 'knowledge-1', category: 'knowledge', severity: 'major',
          description: 'Thorne names the clerk before the chapter gives the name to her.',
          instruction: 'Take the knowledge away.', evidence: [{ chapter: 1, revision: 1, quote: prose(1).slice(0, 40) }],
        }] });
      }
      return base(prompt, system, options);
    });
    await (new NovelEngine(llm, new MemoryRunStore()) as any).acceptOrRepair(run, chapter, candidate);
    // Twice refused, and the run lives: the chapter keeps the version that still speaks.
    expect(chapter.status).not.toBe('needs_revision');
    expect(acceptedVersion(chapter)!.content).toContain('"Then we are finished here," he answered.');
    expect(chapter.versions.some(version => version.content.includes('She said nothing at all'))).toBe(false);
    expect(attempts).toBe(2);
    // What could not be repaired is recorded rather than waived in silence.
    expect(chapter.unrepairable?.some(issue => issue.id === 'knowledge-1')).toBe(true);
    expect(chapter.planningNote).toContain('spoken line');
    expect(chapter.rejectedRepairs?.[0].reason).toContain('spoken line');
  });
});

describe('A scene plan without the fields nothing reads', () => {
  it('is valid: a scene is judged on its goal, its resistance and its outcome', () => {
    const run = runWithPlans();
    const scene = { sceneId: 's1', location: 'the archive', participants: ['Thorne', 'the clerk'], objective: 'recover the letter',
      conflict: 'the clerk refuses', outcome: 'she pays the price', keyMoments: ['the refusal'], narrativeWeight: 3, conflictCarriedBy: 'speech' };
    const plan = validateChapterPlan({ ...run.chapters[0].plan, detailedScenes: [scene] }, run.spec) as { detailedScenes: { sceneId: string }[] };
    expect(plan.detailedScenes[0].sceneId).toBe('s1');
    // And what a scene is actually judged on is still required.
    expect(() => validateChapterPlan({ ...run.chapters[0].plan, detailedScenes: [{ ...scene, outcome: '' }] }, run.spec)).toThrow();
    expect(() => validateChapterPlan({ ...run.chapters[0].plan, detailedScenes: [{ ...scene, keyMoments: [] }] }, run.spec)).toThrow();
  });
});

describe('Whose eyes the scene is seen through', () => {
  const scene = (extra: object) => ({
    sceneId: 'scene-1', location: 'the kitchen', participants: ['Alfred', 'Bruce'], objective: 'feed him',
    conflict: 'he will not eat', outcome: 'the tray stays', duration: 'an hour', mood: 'quiet',
    keyMoments: ['the tray goes down', 'the refusal'], ...extra,
  });
  const withScenes = (scenes: object[]) => ({ ...plan(1), detailedScenes: scenes });
  const spec = createBookSpec('A house at night', 3, { language: 'English' });

  it('keeps a viewpoint the scene contains and refuses one it does not', () => {
    expect(validateChapterPlan(withScenes([scene({ pov: 'Alfred' })]), spec).detailedScenes?.[0].pov).toBe('Alfred');
    expect(() => validateChapterPlan(withScenes([scene({ pov: 'Clark' })]), spec))
      .toThrow(/seen through "Clark", who is not among its participants/);
    // One person in the room is not an ambiguity about whose eyes it is; it is a name written wrong.
    const alone = validateChapterPlan(withScenes([scene({ participants: ['Alfred'], pov: 'Clark', conflictCarriedBy: 'solitude' })]), spec);
    expect(alone.detailedScenes?.[0].pov).toBe('Alfred');
    expect(alone.normalizations?.join(' ')).toContain('the only person present');
    // Plans made before the field existed declare no viewpoint, and are not judged against one.
    expect(validateChapterPlan(withScenes([scene({})]), spec).detailedScenes?.[0].pov).toBeUndefined();
  });

  it('gives the reviewer the declaration, and the writer the change', async () => {
    const run = runWithPlans();
    run.chapters[0].plan = validateChapterPlan(withScenes([
      scene({ sceneId: 'scene-1', pov: 'Alfred' }),
      scene({ sceneId: 'scene-2', pov: 'Bruce' }),
    ]), spec);
    expect(viewpointQuestion(run.chapters[0])).toContain('"pov":"Alfred"');
    expect(viewpointQuestion(run.chapters[1])).toBe('');
    let seen = '';
    await writeScene(run, run.chapters[0], 1, async prompt => { seen = prompt; return JSON.stringify({ prose: 'Prose.' }); });
    expect(seen).toContain('seen through one person — Bruce');
    expect(seen).toContain('The previous scene was seen through someone else (Alfred)');
  });
});

describe('What the book has already told the reader', () => {
  it('reaches the reviewer, not only the writer', () => {
    const run = runWithPlans();
    run.chapters[0].alreadyTold = ['the counting on the roof and what it means to Bruce', 'the archive described'];
    run.chapters[1].alreadyTold = ['the archive described'];
    const asked = alreadyExplained(run, run.chapters[2]);
    // Deduplicated, and quoted so a finding can name what is being told twice.
    expect(asked).toContain('the counting on the roof');
    expect(asked.match(/the archive described/g)).toHaveLength(1);
    // The first chapter has nothing before it, and a run whose chapters kept no record asks nothing.
    expect(alreadyExplained(run, run.chapters[0])).toBe('');
    const blank = runWithPlans();
    expect(alreadyExplained(blank, blank.chapters[2])).toBe('');
  });
});
