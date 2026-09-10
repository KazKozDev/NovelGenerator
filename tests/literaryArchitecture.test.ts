import { plannedBeatsFrom } from './beatStub';
import { describe, expect, it, vi } from 'vitest';
import { createBookSpec, type ChapterRecord, type ChapterVersion } from '../utils/novel/contracts';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { assessLiteraryDevelopment, planLiteraryDevelopment } from '../utils/novel/literary';
import { literaryContextKey, literaryCurrent, literaryKinds, literaryLedger } from '../utils/novel/literaryState';
import { addCandidate, acceptCandidate, reconcileCheckpoint } from '../utils/novel/storyState';
import { MemoryRunStore } from '../utils/novel/runStore';
import { compileBook } from '../utils/novel/presentation';
import { sceneWordTargets } from '../utils/novel/proseCraft';
import { literaryResponse, stampLiterary } from './helpers/literaryFixture';

function setup() {
  const run = createRun(createBookSpec('A family chooses whether to disclose a letter.', 3, { targetWordsPerChapter: 300 }), { provider: 'ollama', ollamaModel: 'test', ollamaEndpoint: 'http://localhost:11434' });
  run.outline = 'The family weighs disclosure and pays its cost.';
  run.chapters = [1, 2, 3].map((number): ChapterRecord => ({ number, status: 'pending', repairAttempts: 0, versions: [], plan: {
    title: `Part ${number}`, summary: 'A consequential choice', sceneBreakdown: 'One encounter', characterDevelopmentFocus: 'Trust', plotAdvancement: 'Disclosure', timelineIndicators: 'Evening', emotionalToneTension: 'Tense', connectionToNextChapter: 'Consequences',
    detailedScenes: [{ sceneId: 's1', location: 'house', participants: ['Vera'], objective: 'Read the letter', conflict: 'Fear of disclosure', outcome: 'A choice', duration: 'one hour', mood: 'tense', keyMoments: ['decision'] }],
  } }));
  return run;
}
function prepare(run: ReturnType<typeof setup>, number: number, content = 'Vera opened the letter. She chose to tell her brother the truth.') {
  const version = addCandidate(run.chapters[number - 1], content, 'test');
  version.review = { validationVersion: 2, status: 'passed', issues: [], checkedRevision: version.revision };
  version.analysis = { summary: 'Vera decides to disclose the letter.', facts: [], events: [], promises: [] };
  return version;
}
function accepted(run: ReturnType<typeof setup>, number: number) {
  const version = prepare(run, number);
  stampLiterary(run, number, version);
  acceptCandidate(run, number);
  return version;
}
function report(sources = ['p1']) {
  return { checked: [...literaryKinds], observations: [{ kind: 'ending', subject: 'Vera', before: 'Withheld truth', after: 'Decided to disclose', mechanism: 'A consequential decision', sources }], issues: [] as any[] };
}

describe('Versioned literary architecture', () => {
  it('resolves source IDs, persists observations and never promotes a candidate into history', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    candidate.literary = await assessLiteraryDevelopment(run, run.chapters[0], candidate, async () => JSON.stringify(report()));
    expect(candidate.literary.observations[0].evidence[0]).toEqual({ chapter: 1, revision: 1, quote: candidate.content });
    expect(literaryLedger(run, 2)).toEqual([]);
    acceptCandidate(run, 1);
    const store = new MemoryRunStore();
    await store.save(run);
    const restored = (await store.load())!;
    expect(literaryLedger(restored, 2)[0].observations[0].after).toBe('Decided to disclose');
    addCandidate(restored.chapters[0], 'She concealed it instead.', 'unreviewed');
    expect(literaryLedger(restored, 2)).toEqual([]);
  });

  it.each(['unknown', 'historical-only', 'missing-ending', 'unchecked-dimension'])('rejects %s review evidence instead of allowing acceptance', async mode => {
    const run = setup();
    accepted(run, 1);
    const candidate = prepare(run, 2);
    const raw = report(mode === 'unknown' ? ['p999'] : mode === 'historical-only' ? ['h1.0.0'] : ['p1']);
    if (mode === 'missing-ending') raw.observations[0].kind = 'thought';
    if (mode === 'unchecked-dimension') raw.checked.pop();
    await expect(assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(raw))).rejects.toThrow(/unvalidated/);
    expect(() => acceptCandidate(run, 2)).toThrow(/literary review/);
  });

  it('blocks a semantic repeat despite a passed continuity review and zero shared wording', async () => {
    const run = setup();
    accepted(run, 1);
    const candidate = prepare(run, 2, 'Disclosure was the sole path forward; concealment had become unbearable.');
    const raw = report();
    raw.issues.push({ kind: 'thought', severity: 'major', description: 'The conclusion already reached is announced again without a changed choice.', instruction: 'Develop the consequence of the decision instead of repeating it.', sources: ['h1.0.0', 'p1'] });
    candidate.literary = await assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(raw));
    expect(candidate.review?.status).toBe('passed');
    expect(candidate.literary.status).toBe('failed');
    expect(candidate.literary.issues[0].evidence.map(item => item.chapter)).toEqual([1, 2]);
    expect(() => acceptCandidate(run, 2)).toThrow(/literary review/);
  });

  it('uses accepted history to plan exact scene IDs and gives their weights to the writer', async () => {
    const run = setup();
    accepted(run, 1);
    const chapter = run.chapters[1];
    chapter.plan.detailedScenes.push({ ...chapter.plan.detailedScenes[0], sceneId: 's2' });
    const llm = vi.fn(async (prompt: string, system: string) => {
      const raw = JSON.parse(literaryResponse(prompt, system)!);
      raw.scenes[1].narrativeWeight = 4;
      return JSON.stringify(raw);
    });
    chapter.literaryPlan = await planLiteraryDevelopment(run, chapter, llm);
    expect(llm.mock.calls[0][0]).toContain('Vera opened the letter.');
    expect(chapter.literaryPlan.contextKey).toBe(literaryContextKey(run, 2));
    expect(sceneWordTargets(chapter, 300)).toEqual([60, 240]);
    const raw = JSON.parse(literaryResponse(llm.mock.calls[0][0], llm.mock.calls[0][1])!);
    raw.scenes[1].sceneId = 's1';
    await expect(planLiteraryDevelopment(run, chapter, async () => JSON.stringify(raw))).rejects.toThrow(/Invalid literary scene intent/);
  });

  it('invalidates downstream literary dependencies when an ending changes without changing facts', () => {
    const run = setup();
    accepted(run, 1);
    const later = accepted(run, 2);
    const revised = prepare(run, 1, 'Vera burned the letter. The truth would die with her.');
    stampLiterary(run, 1, revised);
    revised.literary!.observations[0].after = 'Truth permanently withheld';
    acceptCandidate(run, 1);
    expect(run.chapters[1].status).toBe('invalidated');
    expect(literaryCurrent(run, 2, later)).toBe(false);
  });

  it('retains literary cache for unchanged dependencies but rejects modified evidence', () => {
    const run = setup();
    const first = accepted(run, 1);
    const later = accepted(run, 2);
    const revised = prepare(run, 1, first.content);
    stampLiterary(run, 1, revised);
    acceptCandidate(run, 1);
    expect(literaryCurrent(run, 2, later)).toBe(true);
    later.literary!.observations[0].evidence[0].quote = 'Invented quotation';
    expect(literaryCurrent(run, 2, later)).toBe(false);
  });

  it('migrates an old completed manuscript by retaining prose and requiring the new gate', () => {
    const run = setup();
    [1, 2, 3].forEach(number => accepted(run, number));
    run.stage = 'complete';
    run.finalReview = { status: 'passed', checkedRevision: 0, issues: [] };
    delete run.literaryValidationVersion;
    const contents = run.chapters.map(chapter => chapter.versions[0].content);
    expect(() => compileBook(run)).toThrow(/reviewed/);
    expect(reconcileCheckpoint(run)).toBe(true);
    expect(run.stage).toBe('writing');
    expect(run.chapters.every(chapter => chapter.status === 'invalidated')).toBe(true);
    expect(run.chapters.map(chapter => chapter.versions[0].content)).toEqual(contents);
    expect(reconcileCheckpoint(run)).toBe(false);
  });

  it('persists a failed literary gate and repairs through the engine before accepting', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    const store = new MemoryRunStore();
    const raw = report();
    raw.issues.push({ kind: 'rhetoric', severity: 'major', description: 'The final explanation repeats what the action already establishes.', instruction: 'Replace the redundant explanation with its consequence.', sources: ['p1'] });
    const offline = vi.fn(async (_prompt: string, system: string) => {
      if (system.includes('assess literary development')) return JSON.stringify(raw);
      throw new Error('writer offline');
    });
    await expect((new NovelEngine(offline, store) as any).acceptOrRepair(run, run.chapters[0], candidate)).rejects.toThrow(/writer offline/);
    const saved = (await store.load())!;
    expect(saved.chapters[0].versions[0].literary?.status).toBe('failed');
    expect(saved.chapters[0].acceptedRevision).toBeUndefined();
    const online = vi.fn(async (prompt: string, system: string) => {
      const literary = literaryResponse(prompt, system);
      if (literary) return literary;
      if (system.includes('targeted fiction revision')) return JSON.stringify({ prose: 'Vera mailed the letter. ' + Array.from({ length: 250 }, (_, i) => `word${i}`).join(' ') });
      if (system.includes('continuity and developmental')) return '{"issues":[]}';
      if (system.includes('extract evidence')) {
        if (prompt.includes('TASK: Extract facts')) return '{"summary":"Vera mailed the letter.","facts":[]}';
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
        return '{"promises":[]}';
      }
      throw new Error(system);
    });
    await (new NovelEngine(online, store) as any).acceptOrRepair(saved, saved.chapters[0], saved.chapters[0].versions[0]);
    const acceptedVersion = saved.chapters[0].versions.at(-1)!;
    expect(saved.chapters[0].acceptedRevision).toBe(acceptedVersion.revision);
    expect(acceptedVersion.literary?.status).toBe('passed');
    expect(online.mock.calls.some(([, system]) => system.includes('targeted fiction revision'))).toBe(true);
  });

  it('asks the ledger for what the chapter established, not one entry per dimension', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    let seen = '';
    await assessLiteraryDevelopment(run, run.chapters[0], candidate, async prompt => { seen = prompt; return JSON.stringify(report()); });
    // Six observations produced every time, one per kind, is a ledger padded to cover the list.
    expect(seen).toContain('Do not write one observation per dimension');
    expect(seen).toContain('a chapter that establishes two things must produce two observations');
    // Six assessments across three runs reported zero defects; a defect must be as sayable as none.
    expect(seen).toContain('Six clean dimensions and six defects are both possible results');
    expect(seen).toContain('does not collect suggestions');
  });
});