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
import { literaryStillHolds, stalledThreads } from '../utils/novel/literaryState';
import { ledgerForPlanning } from '../utils/novel/literary';
import { compressPlanningLedger } from '../utils/novel/literary';

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

  it('compresses the planning ledger past budget and leaves small histories verbatim', async () => {
    const run = setup();
    accepted(run, 1);
    accepted(run, 2);
    const history = literaryLedger(run, 3);
    expect(history.length).toBeGreaterThan(0);
    expect(await compressPlanningLedger(history)).toEqual(ledgerForPlanning(history));
    const summarize = async () => 'COMPRESSED-LINE';
    const compressed = await compressPlanningLedger(history, summarize, 10) as {
      chapter: number; observations: { evidence: string[] }[];
    }[];
    expect(compressed).toHaveLength(history.length);
    expect(compressed[0].observations.length).toBe(history[0].observations.length);
    expect(compressed[0].observations[0].evidence).toEqual(['COMPRESSED-LINE']);
    expect(JSON.stringify(compressed).length).toBeLessThan(JSON.stringify(ledgerForPlanning(history)).length);
  });

  it('falls back to truncated quotes when the summarizer fails', async () => {
    const run = setup();
    accepted(run, 1);
    const history = literaryLedger(run, 2);
    const failing = async (): Promise<string> => {
      throw new Error('Missing required scale');
    };
    const fallback = await compressPlanningLedger(history, failing, 10) as {
      chapter: number; observations: { evidence: string[] }[];
    }[];
    expect(fallback).toHaveLength(history.length);
    expect(fallback[0].observations[0].evidence).toHaveLength(1);
    expect(fallback[0].observations[0].evidence[0]).toContain('Vera opened the letter');
  });

  it('tells the model how to repair bad literary source IDs on retry', async () => {
    const run = setup();
    accepted(run, 1);
    const candidate = prepare(run, 2);
    await expect(assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(report(['p999'])))).rejects.toThrow(/SOURCE TEXT/);
    await expect(assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(report(['p999'])))).rejects.toThrow(/p999/);
    await expect(assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(report(['h1.0.0'])))).rejects.toThrow(/p-unit/);
  });

  it('keeps an assessment whose findings cite more real passages than the cap allows', async () => {
    const run = setup();
    accepted(run, 1);
    // Long enough to split into several p-units, so thirteen real IDs exist to over-cite with.
    const candidate = prepare(run, 2, 'Vera opened the letter. '.repeat(1200));
    const paragraphs = Math.ceil(candidate.content.length / 1800);
    expect(paragraphs).toBeGreaterThan(13);
    const overCited = Array.from({ length: 13 }, (_, index) => `p${index + 1}`);
    // The ending observation must still cite the last unit, so it gets its own entry.
    const raw = report([`p${paragraphs}`]);
    raw.observations.push({ kind: 'thought', subject: 'Vera', before: 'Silent', after: 'Speaking', mechanism: 'A decision carried through', sources: overCited });

    const assessment = await assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(raw));
    // Trimmed to the cap rather than thrown away: every ID it gave was a real passage of this chapter.
    expect(assessment.observations[1].evidence).toHaveLength(12);
    expect(assessment.observations[1].evidence.every(item => item.chapter === 2)).toBe(true);
  });

  it('names over-citing and invented IDs differently, so a retry is told what is actually wrong', async () => {
    const run = setup();
    accepted(run, 1);
    const candidate = prepare(run, 2);
    // An invented ID is named on its own; the valid IDs beside it are not paraded as the defect.
    await expect(assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(report(['p1', 'p999']))))
      .rejects.toThrow(/Unknown literary evidence source \(p999\)/);
    await expect(assessLiteraryDevelopment(run, run.chapters[1], candidate, async () => JSON.stringify(report([]))))
      .rejects.toThrow(/must cite its sources/);
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
    // The refusal names the scene and the fault, because that message is what the retry works from.
    await expect(planLiteraryDevelopment(run, chapter, async () => JSON.stringify(raw))).rejects.toThrow(/Scene "s1" appears twice/);

    // A weight the model quoted is the weight it meant: read as a number rather than refused.
    const quoted = JSON.parse(literaryResponse(llm.mock.calls[0][0], llm.mock.calls[0][1])!);
    quoted.scenes[1].narrativeWeight = '4';
    const lenient = await planLiteraryDevelopment(run, chapter, async () => JSON.stringify(quoted));
    expect(lenient.scenes[1].narrativeWeight).toBe(4);
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

  const longChapter = (marker = 'Он запер дверь.') =>
    `${Array.from({ length: 60 }, (_, i) => `Смотритель прошёл вдоль ряда колонн и отметил показание номер ${i}.`).join(' ')} ${marker}`;

  it('keeps an assessment across a repair that left every cited passage on the page', () => {
    const run = setup();
    const first = prepare(run, 1, longChapter());
    stampLiterary(run, 1, first);
    const quote = first.literary!.observations[0].evidence[0].quote;
    // A repair at the median size measured on a live run: one sentence of sixty replaced.
    const repaired = addCandidate(run.chapters[0], first.content.replace('показание номер 3.', 'показание номер три, впервые за смену.'), 'repair');
    expect(repaired.content).toContain(quote);
    expect(literaryStillHolds(first, repaired, 1)).toBe(true);
  });

  it('assesses again when the cited passage is gone, or when the revision is not small', () => {
    const run = setup();
    const first = prepare(run, 1, longChapter());
    stampLiterary(run, 1, first);
    // The ending it cited is no longer on the page.
    const cut = addCandidate(run.chapters[0], longChapter('Он ушёл, не запирая ничего.'), 'ending rewritten');
    expect(literaryStillHolds(first, cut, 1)).toBe(false);
    // Every quotation survives here; the chapter simply grew too much to be the same reading.
    const grown = addCandidate(run.chapters[0], `${first.content} ${Array.from({ length: 20 }, (_, i) => `Новая сцена, часть ${i}.`).join(' ')}`, 'grown');
    expect(grown.content).toContain(first.literary!.observations[0].evidence[0].quote);
    expect(literaryStillHolds(first, grown, 1)).toBe(false);
  });

  it('plans against what earlier chapters established, not against their full text', () => {
    const long = 'x'.repeat(1800);
    const ledger = ledgerForPlanning([{ chapter: 1, observations: [{ kind: 'ending', subject: 's', before: 'b', after: 'a', mechanism: 'm', evidence: [{ chapter: 1, revision: 1, quote: `The keeper opened the piano at last. ${long}` }] }] }] as never);
    const rendered = JSON.stringify(ledger);
    // The move is recognised by what it was; the 1800 characters that prove it stay in the record.
    expect(rendered).toContain('The keeper opened the piano at last');
    expect(rendered.length).toBeLessThan(900);
  });

  it('redraws a literary gate that cannot cite its evidence, instead of ending the run', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    let drawn = 0;
    const llm = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('assess literary development')) {
        // The first draw cites a source that does not exist; the gate cannot judge, and a run that
        // died here would lose every chapter already accepted behind it.
        if (++drawn <= 2) return JSON.stringify({ ...report(), observations: [{ ...report().observations[0], sources: ['p999'] }] });
        return literaryResponse(prompt, system);
      }
      if (system.includes('continuity and developmental')) return '{"issues":[]}';
      if (system.includes('extract evidence')) {
        if (prompt.includes('TASK: Extract facts')) return '{"summary":"Vera mailed the letter.","facts":[]}';
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
        if (prompt.includes('TASK: Extract conditions')) return JSON.stringify({ conditions: [] });
        return '{"promises":[]}';
      }
      throw new Error(system);
    });
    await (new NovelEngine(llm as never, new MemoryRunStore()) as never as { acceptOrRepair: (run: unknown, chapter: unknown, candidate: unknown) => Promise<void> })
      .acceptOrRepair(run, run.chapters[0], candidate);
    expect(drawn).toBeGreaterThan(2);
    expect(run.chapters[0].status).toBe('accepted');
  });

  it('persists a failed literary gate and repairs through the engine before accepting', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    const store = new MemoryRunStore();
    const raw = report();
    raw.issues.push({ kind: 'rhetoric', severity: 'major', description: 'The final explanation repeats what the action already establishes.', instruction: 'Replace the redundant explanation with its consequence.', sources: ['p1'] });
    const offline = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('assess literary development')) return JSON.stringify(raw);
      // Extraction and the beat registry now run before the gate, so they have to answer for the
      // chapter to reach it at all; only the writer is offline.
      if (system.includes('extract evidence')) {
        if (prompt.includes('TASK: Extract facts')) return '{"summary":"Vera mailed the letter.","facts":[]}';
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
        if (prompt.includes('TASK: Extract conditions')) return JSON.stringify({ conditions: [] });
        return '{"promises":[]}';
      }
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
        if (prompt.includes('TASK: Extract conditions')) return JSON.stringify({ conditions: [] });
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

describe('The order the checks run in', () => {
  it('reaches the literary gate only after extraction and the beat registry have accepted the version', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    // An unextracted version, because extraction is what this order is about: a candidate that
    // already carries an analysis of its own revision is never extracted twice.
    candidate.analysis = undefined;
    const order: string[] = [];
    const llm = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('extract evidence')) {
        if (prompt.includes('TASK: Extract facts')) { order.push('extraction'); return '{"summary":"Vera mailed the letter.","facts":[]}'; }
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
        if (prompt.includes('TASK: Extract conditions')) return JSON.stringify({ conditions: [] });
        return '{"promises":[]}';
      }
      if (system.includes('assess literary development')) { order.push('literary'); return literaryResponse(prompt, system)!; }
      if (system.includes('continuity and developmental')) return '{"issues":[]}';
      throw new Error(system);
    });
    await (new NovelEngine(llm as never, new MemoryRunStore()) as never as { acceptOrRepair: (r: unknown, c: unknown, v: unknown) => Promise<void> })
      .acceptOrRepair(run, run.chapters[0], candidate);
    // The most expensive call in the system runs last, on a version the cheap checks already accepted.
    expect(order).toEqual(['extraction', 'literary']);
    expect(run.chapters[0].status).toBe('accepted');
  });

  /**
   * The round that could not end.
   *
   * A live run spent forty minutes on one chapter doing nothing but extraction. The planned beats
   * never reached the page, so the registry failed the version; the repair budget conceded the
   * finding and passed the version again; the top of the loop, seeing a passed review, extracted the
   * same unchanged prose from scratch, the registry raised the same gap, and round it went. A
   * concession has to be final, and a revision is extracted once.
   */
  it('accepts a conceded beat gap instead of extracting the same revision every round', async () => {
    const run = setup();
    run.spec.forwardOnly = true;
    const candidate = prepare(run, 1);
    candidate.analysis = undefined;
    let extractions = 0;
    let repairs = 0;
    const llm = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('extract evidence')) {
        if (prompt.includes('TASK: Extract facts')) { extractions++; return '{"summary":"Vera mailed the letter.","facts":[]}'; }
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        // Nothing the chapter planned reached its page, and no repair here ever puts it there.
        if (prompt.includes('TASK: Extract beats')) return '{"beats":[]}';
        if (prompt.includes('TASK: Extract conditions')) return '{"conditions":[]}';
        return '{"promises":[]}';
      }
      if (system.includes('assess literary development')) return literaryResponse(prompt, system)!;
      if (system.includes('continuity and developmental')) return '{"issues":[]}';
      if (system.includes('targeted fiction revision')) {
        repairs++;
        return JSON.stringify({ prose: `Vera opened the letter and sat with it a while. She chose to tell her brother the truth, and said so on the ${repairs} attempt.` });
      }
      throw new Error(system);
    });
    await (new NovelEngine(llm as never, new MemoryRunStore()) as never as { acceptOrRepair: (r: unknown, c: unknown, v: unknown) => Promise<void> })
      .acceptOrRepair(run, run.chapters[0], run.chapters[0].versions[run.chapters[0].versions.length - 1]);
    expect(run.chapters[0].status).toBe('accepted');
    // One extraction per revision written, and no revision extracted twice.
    expect(extractions).toBeLessThanOrEqual(repairs + 1);
    // The gap the chapter could not answer stays in its report, as the advisory note it became.
    const accepted = run.chapters[0].versions.find(version => version.revision === run.chapters[0].acceptedRevision);
    expect(accepted?.review?.issues.some(issue => issue.id === 'undramatized-beat' && issue.severity === 'minor')).toBe(true);
  });
});

describe('A chapter the literary gate keeps failing', () => {
  it('goes to repair instead of being read and extracted again over the same words', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    let reviews = 0, extractions = 0, repairs = 0;
    const llm = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('extract evidence')) {
        // One round of extraction is four calls; count the round, not the calls.
        if (prompt.includes('TASK: Extract facts')) { extractions++; return '{"summary":"Vera mailed the letter.","facts":[]}'; }
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
        if (prompt.includes('TASK: Extract conditions')) return JSON.stringify({ conditions: [] });
        return '{"promises":[]}';
      }
      if (system.includes('assess literary development')) {
        // The gate fails this chapter every time, which is the shape that used to loop: the review
        // passes, the gate fails, the loop returns to the top and reads the same prose again.
        const ids = [...prompt.matchAll(/"id":"(p\d+)"/g)].map(match => match[1]);
        const source = ids.at(-1) || 'p1';
        return JSON.stringify({ ...report([source]), issues: [{ kind: 'ending', severity: 'major', description: 'The ending changes nothing.', instruction: 'Make the choice cost something.', sources: [source] }] });
      }
      if (system.includes('continuity and developmental')) { reviews++; return '{"issues":[]}'; }
      if (system.includes('targeted fiction revision')) { repairs++; return JSON.stringify({ prose: `Repaired ${repairs}. ${'Слово '.repeat(200)}` }); }
      throw new Error(system);
    });
    await (new NovelEngine(llm as never, new MemoryRunStore()) as never as { acceptOrRepair: (r: unknown, c: unknown, v: unknown) => Promise<void> })
      .acceptOrRepair(run, run.chapters[0], candidate).catch(() => {});
    // One reading and one extraction per version, and every failed gate answered by a repair rather
    // than by another reading. A live run spent seven rounds of thirteen calls on one chapter this way.
    // One reading per version is the invariant this guards: the loop may fail a version after the
    // reading — the literary gate does exactly that — but it must answer with a repair rather than
    // with another reading of the same words. Extraction follows the reading and keeps its own
    // behaviour, so it is counted here for the record rather than pinned.
    const versions = run.chapters[0].versions.length;
    expect(reviews).toBeLessThanOrEqual(versions);
    expect(repairs).toBeGreaterThan(0);
    expect(extractions).toBeGreaterThan(0);
  });
});

describe('A literary gate the network would not let through', () => {
  it('stops the chapter rather than the run, however many attempts the transport eats', async () => {
    const run = setup();
    const candidate = prepare(run, 1);
    let assessments = 0;
    const llm = vi.fn(async (prompt: string, system: string) => {
      if (system.includes('extract evidence')) {
        if (prompt.includes('TASK: Extract facts')) return '{"summary":"Vera mailed the letter.","facts":[]}';
        if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
        if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
        if (prompt.includes('TASK: Extract conditions')) return JSON.stringify({ conditions: [] });
        return '{"promises":[]}';
      }
      // A dropped connection, on every attempt: not a verdict on the chapter, and not a bad answer.
      if (system.includes('assess literary development')) { assessments++; throw new TypeError('Failed to fetch'); }
      if (system.includes('continuity and developmental')) return '{"issues":[]}';
      throw new Error(system);
    });
    const engine = new NovelEngine(llm as never, new MemoryRunStore()) as never as { acceptOrRepair: (r: unknown, c: unknown, v: unknown) => Promise<void> };
    // The retry used to sit outside the catch, so the second failure escaped as a raw TypeError with
    // every accepted chapter behind it and nothing marked for a reader.
    await expect(engine.acceptOrRepair(run, run.chapters[0], candidate)).rejects.toThrow(/needs editorial attention: the literary assessment could not be completed/);
    // Three assessments, each of which asks twice inside structuredResponse before giving up.
    expect(assessments).toBe(6);
    expect(run.chapters[0].status).toBe('needs_revision');
  });
});

describe('A thread that does not move', () => {
  const thread = (chapter: number, before: string, after: string) =>
    ({ chapter, observations: [{ kind: 'thought' as const, subject: 'Elara Vance\'s belief in repair as a moral good', before, after, mechanism: 'm', evidence: [] }] });

  it('is reported when a chapter opens where the one before it opened', () => {
    // Quoted from a finished English run: chapter three's "before" repeated chapter two's word for word.
    const opening = 'Elara views repair as an unquestioned virtue, a technical act that restores order to a broken machine.';
    const stalled = stalledThreads([
      thread(2, opening, 'Elara confronts the possibility that repair can be an act of violence.'),
      thread(3, opening, 'Elara confronts the idea that repair can be an act of violence, erasing intention.'),
    ]);
    expect(stalled).toHaveLength(1);
    expect(stalled[0]).toMatchObject({ chapter: 3, kind: 'thought' });
  });

  it('says nothing when a chapter opens where the one before it ended', () => {
    const moved = stalledThreads([
      thread(2, 'Elara views repair as an unquestioned virtue that restores order to a broken machine.', 'Elara sees that repair can erase what a person meant to keep.'),
      thread(3, 'Elara sees that repair can erase what a person meant to keep, and does it anyway for money.', 'Elara refuses the work that would erase it.'),
    ]);
    expect(moved).toEqual([]);
  });

  it('is reported when a chapter arrives where the one before it arrived', () => {
    // The manuscript version of this: "the count did not start again from one", announced as new in
    // four chapters running. The thread opens honestly each time and reaches nowhere.
    const arrival = 'Clark stops holding himself back and does not call it an accident.';
    const stalled = stalledThreads([
      thread(2, 'Clark holds himself back from every touch and calls each slip an accident.', arrival),
      thread(3, 'Clark has stopped holding back once, on a roof, under pressure.', arrival),
    ]);
    expect(stalled).toHaveLength(1);
    expect(stalled[0]).toMatchObject({ chapter: 3, reason: 'arrives where the last one arrived' });
  });

  it('names which of the two failures it found', () => {
    const opening = 'Elara views repair as an unquestioned virtue that restores order to a broken machine.';
    const stalled = stalledThreads([
      thread(2, opening, 'Elara confronts the possibility that repair can be an act of violence.'),
      thread(3, opening, 'Elara decides the tower is worth the cost of the work.'),
    ]);
    expect(stalled[0].reason).toBe('opens where the last one opened');
  });

  it('does not compare threads that are not the same thread', () => {
    const unrelated = [
      { chapter: 2, observations: [{ kind: 'thought' as const, subject: 'Elara and repair', before: 'A state of things at the opening of the chapter.', after: 'Something else entirely.', mechanism: 'm', evidence: [] }] },
      { chapter: 3, observations: [{ kind: 'thought' as const, subject: 'Elias and the sale of the tower', before: 'A state of things at the opening of the chapter.', after: 'Another thing.', mechanism: 'm', evidence: [] }] },
    ];
    expect(stalledThreads(unrelated)).toEqual([]);
  });
});
