import { describe, it, expect, vi } from 'vitest';
import { bandsFor, curveProblems, defaultProfile, describeProfile, profileOf, profileProblems, readProfile, readRung } from '../utils/novel/v2/profile';
import { designBudgetGaps, premiseGivenGaps, validateBookDesign } from '../utils/novel/v2/designer';
import { checkChapterPlan, matchLedgerEntry, outcomeRun } from '../utils/novel/v2/planGate';
import { repeatedStaging, sceneShape } from '../utils/novel/v2/shapes';
import { capitalizedMidSentence, extractPremiseNames, numericContradictions, repeatedSpans, signatureTics } from '../utils/novel/analytics';
import { describeWorn, priorOutcomeKinds, priorRungs, spentMechanisms, textureDrift, thinScenes, wornLedger } from '../utils/novel/v2/ledger';
import { duplicatedSentences, quoteBalance, repairRepetition } from '../utils/novel/v2/repair';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { applyThreads, citesThread } from '../utils/novel/v2/tracker';
import { openThreadsWithAge } from '../utils/novel/v2/ledger';
import { describeStateDigest, stateDigest } from '../utils/novel/v2/stateDigest';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { budgetFor } from '../utils/novel/v2/orchestrator';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { BookDesign, BookProfile, ChapterPlan, ReaderThread, ScenePlan, StoryState } from '../utils/novel/v2/types';

function profile(overrides: Partial<BookProfile> = {}): BookProfile {
  return {
    ...defaultProfile(),
    cost_kinds: ['a light that goes out'],
    mechanism_ledger: ['climb', 'open', 'wait', 'read'],
    ...overrides,
  };
}

function scene(overrides: Partial<ScenePlan> = {}): ScenePlan {
  return {
    id: 'CH01_S01',
    pov_id: 'C01',
    location: 'Lighthouse',
    story_time: 'night',
    participants: ['C01'],
    initial_conditions: [],
    function: 'f',
    participant_intentions: [],
    pressure_or_uncertainty: 'storm',
    development: 'd',
    required_outcome: 'Aren reaches the upper room.',
    flexible_elements: [],
    required_fact_refs: [],
    required_source_refs: [],
    setup_or_payoff: [],
    transition_to_next: '',
    target_words: 800,
    outcome_kind: 'position',
    ...overrides,
  };
}

function plan(overrides: Partial<ChapterPlan> = {}): ChapterPlan {
  return {
    status: 'ready',
    chapter: 2,
    function: 'f',
    starting_situation: 's',
    ending_change: 'Aren opens the door.',
    mechanism: 'open',
    cost: 'the light goes out',
    pressure_rung: 2,
    scenes: [scene({ id: 'CH02_S01' })],
    forward_dependencies: [],
    replan_reason: null,
    ...overrides,
  };
}

function design(overrides: Partial<BookDesign> = {}): BookDesign {
  return {
    contract: { working_title: 'A Working Title', explicit_requirements: [], inferred_decisions: [], tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    profile: profile(),
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'd', attention: 'a', register: 'r', humor: 'h', emotional_expression: 'e' },
    characters: [{ id: 'C01', name: 'Aren', story_function: 'keeper', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] }],
    world_rules: [],
    causal_map: [],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: [1, 2, 3, 4].map(n => ({
      chapter: n, function: 'f', main_change: 'm', event_ids: [], dependencies: [], setup_or_payoff: [], pov_id: 'C01', target_words: 2000,
      mechanism: ['climb', 'open', 'wait', 'read'][n - 1], cost: 'the light goes out', pressure_rung: n,
    })),
    ...overrides,
  };
}

function gateInput(overrides: Record<string, unknown> = {}) {
  return {
    design: design(),
    chapter: 2,
    plan: plan(),
    spentMechanisms: [] as { mechanism: string; chapters: number[] }[],
    priorRungs: [1],
    recentShapes: [],
    priorOutcomeKinds: [] as string[],
    endingRequirements: [] as string[],
    openThreads: [] as { thread: ReaderThread; madeInChapter: number }[],
    remainingChapters: 3,
    ...overrides,
  } as Parameters<typeof checkChapterPlan>[0];
}

describe('book profile', () => {
  it('reads a book designed before the profile existed as the middle of every band', () => {
    const fallback = profileOf({ } as BookDesign);
    expect(fallback.dialogue_weight).toBe('medium');
    expect(fallback.declared_motifs).toEqual([]);
    expect(bandsFor(fallback).mechanismReuse).toBe(2);
  });

  it('never lets a declared refrain buy unlimited exemption', () => {
    const read = readProfile({ declared_motifs: [{ motif: 'the closed door', allowed_uses: 9999, reason: 'the title' }] });
    expect(read.declared_motifs[0].allowed_uses).toBe(30);
  });

  it('relaxes the staging check for a book that declared itself claustrophobic', () => {
    const tight = bandsFor(profile({ staging_variety: 'low' }));
    const open = bandsFor(profile({ staging_variety: 'high' }));
    expect(tight.stagingRun).toBeGreaterThan(open.stagingRun);
    const shapes = [sceneShape(scene({ id: 'A' })), sceneShape(scene({ id: 'B' })), sceneShape(scene({ id: 'C' }))];
    // The same house three scenes running: a defect in one book, the form in another.
    expect(repeatedStaging(sceneShape(scene({ id: 'D' })), shapes, open)).toMatch(/keeps the staging/);
    expect(repeatedStaging(sceneShape(scene({ id: 'D' })), shapes, tight)).toBe('');
  });

  it('reports a ledger too short to carry the book', () => {
    const problems = profileProblems(profile({ mechanism_ledger: ['climb'] }), 10).map(gap => gap.detail);
    expect(problems.join(' ')).toMatch(/mechanism ledger holds 1 distinct/);
  });

  it('reports a book that can never pay for anything', () => {
    expect(profileProblems(profile({ cost_kinds: [] }), 4).map(gap => gap.detail).join(' ')).toMatch(/names no kind of cost/);
  });

  it('reports a refrain declared without a reason', () => {
    const problems = profileProblems(profile({ declared_motifs: [{ motif: 'the knock', allowed_uses: 5, reason: '' }] }), 4).map(gap => gap.detail);
    expect(problems.join(' ')).toMatch(/tic with a permit/);
  });

  it('checks the rungs against the declared shape, not against monotonicity', () => {
    expect(curveProblems('rising', [1, 2, 3, 4])).toEqual([]);
    expect(curveProblems('rising', [3, 3, 3, 3]).join(' ')).toMatch(/ends at or below/);
    // A romance that only ever tightens is not an oscillation.
    expect(curveProblems('oscillating', [1, 2, 3, 4]).join(' ')).toMatch(/one direction only/);
    expect(curveProblems('oscillating', [1, 3, 2, 4])).toEqual([]);
    // A flat book is allowed to be flat, and a mystery is allowed not to climb.
    expect(curveProblems('flat', [2, 2, 2, 2])).toEqual([]);
    expect(curveProblems('investigative', [1, 1, 2, 2])).toEqual([]);
    expect(curveProblems('descending', [4, 3, 2, 1])).toEqual([]);
  });

  it('says nothing about a book too short to have a shape', () => {
    expect(curveProblems('rising', [1, 1])).toEqual([]);
  });

  it('puts the declared refrains in front of the planner in words', () => {
    const described = describeProfile(profile({ declared_motifs: [{ motif: 'the knock', allowed_uses: 8, reason: 'the title' }] }));
    expect(described).toMatch(/Deliberate refrains/);
    expect(described).toMatch(/"the knock" ×8/);
  });
});

describe('design budgets', () => {
  it('passes a design whose allocation covers the book', () => {
    expect(designBudgetGaps(design(), 4)).toEqual([]);
  });

  it('names the chapters that take nothing from anyone', () => {
    const bare = design();
    bare.chapter_map[2] = { ...bare.chapter_map[2], cost: '' };
    expect(designBudgetGaps(bare, 4).map(gap => gap.detail).join(' ')).toMatch(/Chapters 3 take nothing/);
  });

  it('refuses a chapter mechanism the ledger never held', () => {
    const off = design();
    off.chapter_map[1] = { ...off.chapter_map[1], mechanism: 'shout at the sea' };
    expect(designBudgetGaps(off, 4).map(gap => gap.detail).join(' ')).toMatch(/which the mechanism ledger does not hold/);
  });

  it('catches one solution carrying the whole middle of the book', () => {
    const same = design();
    same.chapter_map = same.chapter_map.map(entry => ({ ...entry, mechanism: 'climb' }));
    expect(designBudgetGaps(same, 4).map(gap => gap.detail).join(' ')).toMatch(/carries 4 chapters .* past this book's allowance of 2/);
  });

  it('lets a procedural repeat its method when it declared that it would', () => {
    const procedural = design({ profile: profile({ mechanism_reuse: 'high' }) });
    procedural.chapter_map = procedural.chapter_map.map(entry => ({ ...entry, mechanism: 'read' }));
    expect(designBudgetGaps(procedural, 4).filter(gap => gap.detail.includes('carries'))).toEqual([]);
  });

  it('says when a declared curve is a label nothing traces', () => {
    const unrunged = design();
    unrunged.chapter_map = unrunged.chapter_map.map(entry => ({ ...entry, pressure_rung: undefined }));
    expect(designBudgetGaps(unrunged, 4).map(gap => gap.detail).join(' ')).toMatch(/No chapter takes a rung/);
  });
});

describe('plan gate', () => {
  it('passes a chapter that pays, climbs and draws an unspent mechanism', () => {
    expect(checkChapterPlan(gateInput())).toEqual([]);
  });

  it('refuses a mechanism the book has already spent to its allowance', () => {
    const findings = checkChapterPlan(gateInput({
      spentMechanisms: [{ mechanism: 'open', chapters: [3, 4] }],
    }));
    expect(findings.map(item => item.code)).toContain('mechanism-exhausted');
    expect(findings[0].severity).toBe('blocking');
  });

  it('refuses a chapter that costs nothing', () => {
    const findings = checkChapterPlan(gateInput({ plan: plan({ cost: '   ' }) }));
    expect(findings.map(item => item.code)).toContain('no-cost');
    expect(findings.find(item => item.code === 'no-cost')?.detail).toMatch(/a light that goes out/);
  });

  it('refuses a chapter that takes no rung, and one that breaks the declared curve', () => {
    expect(checkChapterPlan(gateInput({ plan: plan({ pressure_rung: undefined }) })).map(item => item.code)).toContain('no-rung');
    const broken = checkChapterPlan(gateInput({ priorRungs: [4, 3], plan: plan({ pressure_rung: 1 }) }));
    expect(broken.map(item => item.code)).toContain('curve-break');
  });

  it('blocks a repeated staging instead of whispering about it', () => {
    const repeated = [sceneShape(scene({ id: 'CH01_S01' })), sceneShape(scene({ id: 'CH01_S02' }))];
    const findings = checkChapterPlan(gateInput({ recentShapes: repeated }));
    const staging = findings.find(item => item.code === 'repeated-staging');
    expect(staging?.severity).toBe('blocking');
  });

  it('counts the run of one outcome class across the chapter boundary', () => {
    expect(outcomeRun(['position', 'position'], ['position'])).toEqual({ kind: 'position', run: 3 });
    expect(outcomeRun(['position', 'loss'], ['position'])).toEqual({ kind: 'position', run: 1 });
    const findings = checkChapterPlan(gateInput({
      priorOutcomeKinds: ['position', 'position', 'position'],
      recentShapes: [],
    }));
    expect(findings.map(item => item.code)).toContain('outcome-monotony');
  });

  it('notices a scene that names no outcome class, without replanning for it', () => {
    const findings = checkChapterPlan(gateInput({ plan: plan({ scenes: [scene({ id: 'CH02_S01', outcome_kind: '' })] }) }));
    const missing = findings.find(item => item.code === 'no-outcome-kind');
    expect(missing?.severity).toBe('advisory');
  });

  it('raises the ending capacity while chapters remain to spend on it', () => {
    const findings = checkChapterPlan(gateInput({
      endingRequirements: ['The keeper learns to swim.', 'The outer door is explained.', 'The lamp is relit by another hand.', 'The logbook is burned.'],
      remainingChapters: 2,
    }));
    expect(findings.map(item => item.code)).toContain('ending-capacity');
  });

  it('stays quiet when the chapter is actually preparing the ending', () => {
    const preparing = plan({ ending_change: 'Aren burns the logbook on the gallery.' });
    const findings = checkChapterPlan(gateInput({
      plan: preparing,
      endingRequirements: ['The logbook is burned.', 'The outer door is explained.', 'The lamp is relit.'],
      remainingChapters: 2,
    }));
    expect(findings.map(item => item.code)).not.toContain('ending-capacity');
  });
});

describe('prose tics and numeric drift', () => {
  const filler = 'The keeper walked the gallery and counted the lamps and wrote the hour in a book she kept for the purpose. ';

  it('reports the antithesis construction at a rate, not at a count', () => {
    const text = filler.repeat(20)
      + 'It was not a knock. It was the preparation for one. '.repeat(4)
      + 'The sound was not a warning, but an announcement. '.repeat(3);
    const tics = signatureTics(text);
    expect(tics.map(item => item.id)).toContain('antithesis');
  });

  it('reports sentences that all open on the same word', () => {
    const text = 'She wrote the time in the green book and closed it again. '.repeat(30) + filler.repeat(5);
    expect(signatureTics(text).map(item => item.id)).toContain('uniform-openings');
  });

  it('reports prose that runs at one speed', () => {
    const text = 'The keeper counted the lamps and wrote the hour down again. '.repeat(40);
    expect(signatureTics(text).map(item => item.id)).toContain('flat-rhythm');
  });

  it('says nothing about a scene too short to measure', () => {
    expect(signatureTics('It was not a knock. It was the preparation for one.')).toEqual([]);
  });

  it('catches a founding date that moved between chapters', () => {
    const clashes = numericContradictions([
      { ref: 'Chapter 1', text: 'The sign read ALDERBROOK, EST. 1207, and the gold leaf was new.' },
      { ref: 'Chapter 2', text: 'A brass plaque read TOWN OF ALDERBROOK, EST. 1243, above the door.' },
    ]);
    expect(clashes.map(item => item.context)).toContain('est');
    expect(clashes.find(item => item.context === 'est')?.values).toEqual(['1207', '1243']);
  });

  it('says nothing when a number stays the number it was', () => {
    const clashes = numericContradictions([
      { ref: 'Chapter 1', text: 'The sign said POP. 604 and the paint was fresh.' },
      { ref: 'Chapter 2', text: 'At the town line the sign still said POP. 604.' },
    ]);
    expect(clashes).toEqual([]);
  });
});

describe('the craft ledger', () => {
  function storeWith(chapters: { chapter: number; text: string }[]): MemoryProjectStore {
    const store = new MemoryProjectStore();
    for (const item of chapters) store.saveManuscript(item.chapter, item.text);
    return store;
  }

  it('reads what the finished chapters spent', () => {
    const store = new MemoryProjectStore();
    store.saveChapterPlan(plan({ chapter: 1, mechanism: 'climb', pressure_rung: 1 }));
    store.saveChapterPlan(plan({ chapter: 2, mechanism: 'climb', pressure_rung: 3 }));
    expect(spentMechanisms(store, 2)).toEqual([{ mechanism: 'climb', chapters: [1, 2] }]);
    expect(priorRungs(store, 2)).toEqual([1, 3]);
  });

  it('reads the outcome classes off the accepted scenes, not off the plans', () => {
    const store = new MemoryProjectStore();
    store.saveChapterPlan(plan({ chapter: 1, scenes: [scene({ outcome_kind: 'position' })] }));
    store.saveScene({ id: 'CH01_S01', chapter: 1, prose: 'p', paragraph_ids: [], plan: scene({ outcome_kind: 'loss' }), delta: null });
    expect(priorOutcomeKinds(store, 1)).toEqual(['loss']);
  });

  // The worn-phrase detector reports a rate, so it needs a chapter's worth of
  // prose before it says anything — a short fixture would measure nothing.
  const tic = 'She wrote it in flat capitals. The flat capitals held against the quiet. ';
  const padding = 'The keeper climbed the stair and counted the lamps and wrote the hour down in a book she kept for the purpose. ';
  const worn_text = tic.repeat(5) + padding.repeat(30);

  it('bans an undeclared phrase by its exact wording', () => {
    const store = storeWith([{ chapter: 1, text: worn_text }]);
    const worn = wornLedger(store, profile());
    expect(worn.map(item => item.phrase)).toContain('flat capitals');
    // The wording is banned; the thing it names is not.
    expect(describeWorn(worn)).toMatch(/Do not repeat this wording/);
    expect(describeWorn(worn)).toMatch(/name it plainly/);
  });

  it('exempts a refrain the book declared, up to its budget', () => {
    const store = storeWith([{ chapter: 1, text: worn_text }]);
    const declared = profile({ declared_motifs: [{ motif: 'flat capitals', allowed_uses: 20, reason: 'a hand set against a record' }] });
    expect(wornLedger(store, declared).map(item => item.phrase)).not.toContain('flat capitals');
    // The declaration buys permission, not immunity: past the budget it counts again.
    const stingy = profile({ declared_motifs: [{ motif: 'flat capitals', allowed_uses: 2, reason: 'a hand set against a record' }] });
    expect(wornLedger(store, stingy).map(item => item.phrase)).toContain('flat capitals');
  });

  it('reports a book narrating what it said it would speak', () => {
    const silent = 'The keeper climbed the stair and counted the lamps and wrote the hour down. '.repeat(140);
    const store = storeWith([{ chapter: 1, text: silent }]);
    const report = textureDrift(store, profile({ dialogue_weight: 'high' }));
    expect(report.drift).toMatch(/below the 22–55%/);
  });

  it('calls no drift on a book too short to measure', () => {
    const store = storeWith([{ chapter: 1, text: 'One quiet sentence.' }]);
    expect(textureDrift(store, profile({ dialogue_weight: 'high' })).drift).toBeNull();
  });
});

describe('span repair', () => {
  const earlier = [{ ref: 'Chapter 1', text: 'The upper room smelled of hot glass and rain, and the stair behind her ticked as it cooled.' }];
  const prose = 'Below the gallery the sea kept its counsel.\n\nThe upper room smelled of hot glass and rain, and the stair behind her ticked as it cooled.';

  it('finds the run of words a scene shares with prose already accepted', () => {
    const spans = repeatedSpans(prose, earlier);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toContain('upper room smelled of hot glass and rain');
    expect(spans[0].ref).toBe('Chapter 1');
  });

  it('finds nothing in a scene that repeats nothing', () => {
    expect(repeatedSpans('A wholly different sentence about a wholly different night.', earlier)).toEqual([]);
  });

  it('maps a span back to the sentence holding it', () => {
    const targets = duplicatedSentences(prose, repeatedSpans(prose, earlier));
    expect(targets).toHaveLength(1);
    expect(targets[0].sentence).toMatch(/^The upper room smelled/);
  });

  it('replaces only the duplicated sentence and leaves the rest of the scene alone', async () => {
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({
      replacements: [{
        original: 'The upper room smelled of hot glass and rain, and the stair behind her ticked as it cooled.',
        replacement: 'Hot glass, rain: the upper room had no other smell, and the cooling stair kept time behind her.',
        refused_because: '',
      }],
    }));
    const outcome = await repairRepetition({ design: design(), scene: scene(), prose, earlier }, llm);
    expect(outcome.repaired).toHaveLength(1);
    expect(outcome.prose).toContain('Below the gallery the sea kept its counsel.');
    expect(outcome.prose).toContain('Hot glass, rain: the upper room');
    expect(outcome.prose).not.toContain('smelled of hot glass and rain');
    expect(outcome.left).toEqual([]);
  });

  it('refuses to splice a replacement for a sentence the scene does not contain verbatim', async () => {
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({
      replacements: [{ original: 'A sentence the scene never wrote.', replacement: 'Something else entirely.', refused_because: '' }],
    }));
    const outcome = await repairRepetition({ design: design(), scene: scene(), prose, earlier }, llm);
    expect(outcome.prose).toBe(prose);
    expect(outcome.left.join(' ')).toMatch(/does not occur in the scene verbatim/);
  });

  it('carries an honest refusal through instead of editing the record', async () => {
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({
      replacements: [{
        original: 'The upper room smelled of hot glass and rain, and the stair behind her ticked as it cooled.',
        replacement: '',
        refused_because: 'the repetition is the event',
      }],
    }));
    const outcome = await repairRepetition({ design: design(), scene: scene(), prose, earlier }, llm);
    expect(outcome.prose).toBe(prose);
    expect(outcome.left.join(' ')).toMatch(/the repetition is the event/);
  });

  it('leaves the scene exactly as written when the repair call dies', async () => {
    const llm: NovelLLM = vi.fn(async () => { throw new Error('output token budget'); });
    const outcome = await repairRepetition({ design: design(), scene: scene(), prose, earlier }, llm);
    expect(outcome.prose).toBe(prose);
    expect(outcome.repaired).toEqual([]);
    expect(outcome.left.join(' ')).toMatch(/the repair call failed/);
  });

  it('never calls the model for a scene with nothing to repair', async () => {
    const llm: NovelLLM = vi.fn(async () => { throw new Error('should not be called'); });
    const outcome = await repairRepetition({ design: design(), scene: scene(), prose: 'All new.', earlier }, llm);
    expect(outcome.prose).toBe('All new.');
    expect(llm).not.toHaveBeenCalled();
  });
});

describe('the replan loop', () => {
  const PROSE = 'Aren climbed the stair while the storm took the rail from her hands.\n\nBelow the gallery the outer door stood open on nothing at all.';

  function replies(chapterPlans: ChapterPlan[]): { llm: NovelLLM; plansAsked: () => number } {
    let asked = 0;
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Plan only the current chapter')) {
        const reply = chapterPlans[Math.min(asked, chapterPlans.length - 1)];
        asked++;
        return JSON.stringify(reply);
      }
      if (prompt.includes('Check whether the provided plan is ready')) return JSON.stringify({ ready: true, issues: [] });
      if (prompt.includes('Update the next scene plan against the explicit handoff')) {
        const match = prompt.match(/Original scene plan:\n(\{[^\n]+\})/);
        return JSON.stringify(match ? JSON.parse(match[1]) : scene());
      }
      if (prompt.includes('Write a full literary scene')) return PROSE;
      if (prompt.includes('Rewrite the listed sentences')) return JSON.stringify({ replacements: [] });
      if (prompt.includes('Extract the essential changes from the new scene')) {
        return JSON.stringify({
          proper_names: [], name_variants: [],
          events: [{ description: 'Aren reaches the upper room.', participants: ['C01'], evidence_refs: ['p1'] }],
          state_changes: [], knowledge_changes: [], belief_changes: [], intentions_and_commitments: [],
          reader_disclosures: [], threads_opened: [], threads_resolved: [], contradictions: [],
          uncertainties: [], plan_deviations: [],
        });
      }
      if (prompt.includes('settle the questions')) return JSON.stringify({ resolutions: [] });
      if (prompt.includes('Refine the forward plan')) {
        return JSON.stringify({
          chapter_outcome: 'o', consequences_to_carry_forward: [],
          next_chapter_inputs: { starting_situation: 's', active_intentions: [], necessary_content: [], relevant_fact_refs: [], source_refs_to_retrieve: [] },
          plan_updates: [], ending_readiness: { established_requirements: [], remaining_requirements: [], capacity_problems: [] },
          unresolved_blockers: [],
        });
      }
      throw new Error(`Unexpected stage: ${prompt.slice(0, 60)}`);
    });
    return { llm, plansAsked: () => asked };
  }

  it('rejects a plan before prose and accepts the corrected one', async () => {
    const store = new MemoryProjectStore();
    const spent = plan({ chapter: 1, mechanism: 'climb', pressure_rung: 1 });
    // The first answer costs nothing; the second states what the chapter takes.
    const { llm, plansAsked } = replies([
      plan({ chapter: 1, mechanism: 'climb', pressure_rung: 1, cost: '' }),
      spent,
    ]);
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(plansAsked()).toBe(2);
    expect(store.loadChapterPlan(1)?.cost).toBe('the light goes out');
    // A defect fixed before prose is not a warning the reader has to read.
    expect(outcome.warnings.filter(item => item.includes('unfixed plan defect'))).toEqual([]);
    expect(store.runLog().some(entry => entry.detail.includes('rejected before prose'))).toBe(true);
  });

  it('writes the chapter anyway when the planner will not fix the defect', async () => {
    const store = new MemoryProjectStore();
    const { llm, plansAsked } = replies([plan({ chapter: 1, cost: '', pressure_rung: 1 })]);
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    // Bounded: three attempts, then the finding travels instead of ending the book.
    expect(plansAsked()).toBe(3);
    expect(outcome.warnings.join(' ')).toMatch(/unfixed plan defect \(no-cost\)/);
    expect(store.manuscript()).toHaveLength(1);
  });

  it('does not argue with the planner when it refuses the chapter map itself', async () => {
    const store = new MemoryProjectStore();
    const { llm, plansAsked } = replies([
      { ...plan({ chapter: 1 }), status: 'needs_replan' as const, replan_reason: 'the door was already opened in chapter one' },
    ]);
    await expect(new ChapterPipelineV2().writeChapter(design(), 1, store, llm))
      .rejects.toThrow(/cannot be written as planned: the door was already opened/);
    expect(plansAsked()).toBe(1);
  });
});



describe('a design must declare what kind of book it is', () => {
  it('refuses a design with no profile at all', () => {
    const { profile: _dropped, ...rest } = design();
    expect(() => validateBookDesign(rest, 4)).toThrow(/missing "profile"/);
  });

  it('refuses a profile that is not an object', () => {
    expect(() => validateBookDesign({ ...design(), profile: 'literary horror' }, 4))
      .toThrow(/carries no profile object/);
  });

  it('keeps a declined allocation declined instead of filling it in', () => {
    const bare = design();
    bare.chapter_map = bare.chapter_map.map(entry => ({ ...entry, cost: undefined, pressure_rung: undefined } as never));
    const validated = validateBookDesign(bare, 4);
    expect(validated.chapter_map[0].cost).toBe('');
    // Never 0: a rung of zero would read as the bottom of the curve.
    expect(validated.chapter_map[0].pressure_rung).toBeNull();
    expect(designBudgetGaps(validated, 4).map(gap => gap.detail).join(' ')).toMatch(/take nothing from anyone/);
  });

  it('reads a rung without turning a refusal into the lowest step', () => {
    expect(readRung(null)).toBeNull();
    expect(readRung(undefined)).toBeNull();
    expect(readRung('')).toBeNull();
    expect(readRung('3')).toBe(3);
    expect(readRung(0)).toBe(0);
  });
});

describe('premise givens with no long word in them', () => {
  function placed(extra: Record<string, unknown> = {}): BookDesign {
    const base = design();
    return {
      ...base,
      contract: {
        ...base.contract,
        premise_givens: [{ given: 'The year is 1207', kind: 'fact' }],
      },
      ...extra,
    } as BookDesign;
  }

  it('accepts a short given the construction actually places', () => {
    const design_ = placed({
      world_rules: [{ id: 'R01', rule: 'The exchange still runs on panels fitted in 1207.', relevant_consequences: [] }],
    });
    expect(premiseGivenGaps(design_)).toEqual([]);
  });

  it('still reports a short given the construction never places', () => {
    expect(premiseGivenGaps(placed())).toEqual(['The year is 1207']);
  });

  it('never falls back to demanding the whole phrase verbatim', () => {
    // Every content word here is under five characters, so the old fallback
    // asked the design to contain "the year is 1207" as a literal string — a
    // test no construction passes, on a charge that is blocking and fatal.
    const design_ = placed({
      chapter_map: design().chapter_map.map((entry, index) => index === 0
        ? { ...entry, main_change: 'The night of 12 March 1207 begins.' }
        : entry),
    });
    expect(premiseGivenGaps(design_)).toEqual([]);
  });
});

describe('the phrase threshold does not drift with the profile', () => {
  it('stays put however many refrains a book declares', () => {
    const bare = bandsFor(profile({ declared_motifs: [] })).phraseTolerance;
    const many = bandsFor(profile({
      declared_motifs: [
        { motif: 'a disconnected line', allowed_uses: 4, reason: 'the boundary' },
        { motif: 'scorched wiring', allowed_uses: 3, reason: 'the fire' },
        { motif: 'the number six', allowed_uses: 3, reason: 'the false promise' },
      ],
    })).phraseTolerance;
    // Declaring refrains buys an exemption for those refrains by name, never a
    // higher bar for everything else — that silenced the ban list for a whole book.
    expect(many).toBe(bare);
  });
});

describe('drawing a mechanism from the ledger', () => {
  const ledger = [
    'Listening and recording the calls to extract information',
    'Attempting to trace or call back the disconnected numbers',
    'Confronting a caller with knowledge gained from a previous call',
    'Physically manipulating the panel to disconnect or reroute',
  ];

  it('matches the entry the chapter actually draws on, not the exact string', () => {
    expect(matchLedgerEntry('Confronting a caller with knowledge gained from a previous call', ledger))
      .toBe('confronting a caller with knowledge gained from a previous call');
    // The shape that cost this book three planning attempts: two entries joined.
    expect(matchLedgerEntry(
      'Confronting a caller with knowledge gained from a previous call, and attempting to trace the call despite the physical risks',
      ledger,
    )).toBe('confronting a caller with knowledge gained from a previous call');
  });

  it('still refuses a way of meeting the obstacle the book never planned for', () => {
    expect(matchLedgerEntry('Burning the building down and walking out through the smoke', ledger)).toBeNull();
    // Half-recalling an entry is not drawing on it.
    expect(matchLedgerEntry('Listening to the room', ledger)).toBeNull();
  });

  it('does not reject a chapter that rephrased its allocation', () => {
    const drawn = plan({ mechanism: 'Confronting a caller with what an earlier call gave her, and tracing the number despite the risk' });
    const design_ = design({ profile: profile({ mechanism_ledger: ledger }) });
    const findings = checkChapterPlan(gateInput({ design: design_, plan: drawn }));
    expect(findings.map(item => item.code)).not.toContain('mechanism-unknown');
  });
});

describe('signals that need no invented threshold', () => {
  function bookWith(shares: string[]): MemoryProjectStore {
    const store = new MemoryProjectStore();
    shares.forEach((text, index) => store.saveManuscript(index + 1, text));
    return store;
  }
  // Speech and narration in fixed proportions, so the share per chapter is known.
  const line = '"We should go now," she said.\n\n';
  const narration = 'The keeper climbed the stair and counted the lamps and wrote the hour down in the book.\n\n';
  const chapter = (spoken: number) => line.repeat(spoken) + narration.repeat(40);

  it('reports a book moving away from its own opening', () => {
    const store = bookWith([chapter(20), chapter(10), chapter(3)]);
    const report = textureDrift(store, profile({ dialogue_weight: 'medium' }));
    expect(report.byChapter).toHaveLength(3);
    expect(report.trend).toMatch(/fallen in every chapter/);
  });

  it('says nothing about a book that holds its own level', () => {
    const store = bookWith([chapter(12), chapter(12), chapter(12)]);
    expect(textureDrift(store, profile({ dialogue_weight: 'medium' })).trend).toBeNull();
  });

  it('needs three chapters before a direction is a direction', () => {
    const store = bookWith([chapter(20), chapter(3)]);
    expect(textureDrift(store, profile({ dialogue_weight: 'medium' })).trend).toBeNull();
  });
});

describe('promises the book has made', () => {
  const thread = (id: string, description: string): ReaderThread =>
    ({ id, description, status: 'open', setup_refs: ['CH01_S01'], payoff_refs: [] });

  const open = thread('CH01_S01-t1', 'Aren must close the door she opened during the the old station fire.');

  function resolve(cited: unknown[], threads = [open]) {
    const delta = { threads_opened: [], threads_resolved: cited } as never;
    return applyThreads(threads, delta, 'CH03_S02');
  }

  it('closes a promise cited by its id', () => {
    expect(resolve(['CH01_S01-t1'])[0].status).toBe('resolved');
    expect(resolve([{ id: 'CH01_S01-t1' }])[0].status).toBe('resolved');
  });

  it('closes a promise cited in the model\'s own words', () => {
    // The description is a sentence written several scenes earlier. Requiring it
    // back character for character left every promise a book made standing open,
    // and an abandoned line then looked exactly like a kept one.
    expect(resolve(['Aren closes the door she opened during the fire at the old station.'])[0].status).toBe('resolved');
  });

  it('leaves a promise open when the citation names a different one', () => {
    expect(resolve(['The identity of the caller on Line 17 is revealed.'])[0].status).toBe('open');
    expect(resolve([''])[0].status).toBe('open');
    expect(resolve([])[0].status).toBe('open');
  });

  it('judges each citation against the thread it names', () => {
    expect(citesThread('CH01_S01-t1', open)).toBe(true);
    expect(citesThread('Aren shuts the the old station door she opened during the fire', open)).toBe(true);
    expect(citesThread('Aren eats breakfast', open)).toBe(false);
  });
});

describe('the name registry reads prose, not sentence beginnings', () => {
  // Shaped like real prose: names recur, sentence openers do not become names.
  const prose = [
    'Nothing moved on the gravel path outside the exchange.',
    'Aren crossed the room and set the receiver down beside the board.',
    'Static filled the line, and then a voice came through it.',
    'Listen to me, the voice said, and Aren listened.',
    'Ten minutes later the board rang again in Alderbrook.',
    "Don't answer it, she told herself, and answered it anyway.",
    'The fire at the old station had taken Arthur and it had taken Ruth.',
  ].join('\n\n');

  it('keeps the names and drops the openers', () => {
    const found = extractPremiseNames(prose, true);
    expect(found).toEqual(expect.arrayContaining(['Aren', 'Alderbrook', 'Arthur', 'Ruth']));
    for (const opener of ['Nothing', 'Static', 'Listen', 'Ten', 'Don', "Don't"]) {
      expect(found, `"${opener}" is a sentence opener, not a name`).not.toContain(opener);
    }
  });

  it('keeps the old behaviour for a premise, where openers are few', () => {
    // Two sentences give no evidence either way, so the stopword filter alone
    // decides — as it did before, and as a premise still needs.
    expect(extractPremiseNames('Aren serves the temple. Miro watches her.')).toEqual(['Aren', 'Miro']);
  });

  it('reports which words earned their capital', () => {
    const free = capitalizedMidSentence(prose);
    expect(free.has('Aren')).toBe(true);
    expect(free.has('Nothing')).toBe(false);
  });
});

describe('a repair that would damage the scene does not apply', () => {
  const earlier = [{ ref: 'Chapter 1', text: 'The fire shows what is wanted, and it takes what is not, and it never once explains itself.' }];
  const prose = 'She knelt by the coals.\n\n"The fire shows what is wanted, and it takes what is not, and it never once explains itself."';

  function repairWith(replacement: string) {
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({
      replacements: [{
        original: '"The fire shows what is wanted, and it takes what is not, and it never once explains itself."',
        replacement,
        refused_because: '',
      }],
    }));
    return repairRepetition({ design: design(), scene: scene(), prose, earlier }, llm);
  }

  it('refuses a replacement that still contains the sentence it replaces', async () => {
    // Seen in a finished book: the duplication shipped beside its own rewrite.
    const outcome = await repairWith('"It takes what is not." "The fire shows what is wanted, and it takes what is not, and it never once explains itself."');
    expect(outcome.prose).toBe(prose);
    expect(outcome.left.join(' ')).toMatch(/still contained it word for word/);
  });

  it('refuses a replacement that would leave the quotation marks odd', async () => {
    const outcome = await repairWith('"What the fire wants, it shows; what it does not want, it takes.');
    expect(outcome.prose).toBe(prose);
    expect(outcome.left.join(' ')).toMatch(/quotation marks unbalanced/);
  });

  it('still applies a replacement that is actually one', async () => {
    const outcome = await repairWith('"What the fire wants, it shows; what it does not, it takes, and it explains nothing."');
    expect(outcome.repaired).toHaveLength(1);
    expect(outcome.prose).toContain('What the fire wants');
  });

  it('counts quotation marks without judging the sentence', () => {
    expect(quoteBalance('"a complete quotation."')).toBe(quoteBalance('"another complete one."'));
    expect(quoteBalance('"an opened quotation')).not.toBe(quoteBalance('"a closed one."'));
  });
});

describe('scenes where less happens than anywhere else in the book', () => {
  function bookWith(scenes: { id: string; chapter: number; words: number; events: number }[]): MemoryProjectStore {
    const store = new MemoryProjectStore();
    for (const item of scenes) {
      store.saveScene({
        id: item.id,
        chapter: item.chapter,
        prose: 'word '.repeat(item.words).trim(),
        paragraph_ids: [],
        plan: null,
        delta: {
          proper_names: [], name_variants: [],
          events: Array.from({ length: item.events }, (_, index) => ({ description: `e${index}`, participants: [], evidence_refs: [] })),
          state_changes: [], knowledge_changes: [], belief_changes: [], intentions_and_commitments: [],
          reader_disclosures: [], threads_opened: [], threads_resolved: [], contradictions: [],
          uncertainties: [], plan_deviations: [],
        },
      });
    }
    return store;
  }

  // The shape the real book had: a steady rate, then a closing scene at half of it.
  const book = [
    { id: 'CH01_S01', chapter: 1, words: 800, events: 8 },
    { id: 'CH01_S02', chapter: 1, words: 900, events: 10 },
    { id: 'CH02_S01', chapter: 2, words: 880, events: 11 },
    { id: 'CH02_S02', chapter: 2, words: 906, events: 4 },
  ];

  it('names the scene that stopped carrying its share', () => {
    const found = thinScenes(bookWith(book), 2);
    expect(found.map(item => item.scene)).toEqual(['CH02_S02']);
    expect(found[0].rate).toBeLessThan(found[0].bookRate * 0.6);
  });

  it('judges a meditative book against its own rate, not a number', () => {
    // Every scene sparse at the same rate — a third of the brisk book's. Nothing
    // stands out against its neighbours, so nothing is named. Scaling the whole
    // book down would not do: that keeps the closing scene's shortfall intact.
    const quiet = book.map(item => ({ ...item, events: Math.round(item.words / 300) }));
    expect(thinScenes(bookWith(quiet), 2)).toEqual([]);
  });

  it('says nothing before the book has a rate of its own', () => {
    expect(thinScenes(bookWith(book.slice(0, 2)), 1)).toEqual([]);
  });
});

describe('a promise nobody has to keep', () => {
  const thread = (id: string, description: string): ReaderThread =>
    ({ id, description, status: 'open', setup_refs: [id.split('-')[0]], payoff_refs: [] });

  // The one the book made out loud and did not keep, three books running.
  const standing = thread('CH02_S02-t4', 'Corin will return in three days with the terms in writing.');

  function gate(overrides: Record<string, unknown> = {}) {
    return checkChapterPlan(gateInput({
      chapter: 4,
      plan: plan({ chapter: 4, pressure_rung: 4 }),
      priorRungs: [1, 2, 3],
      openThreads: [{ thread: standing, madeInChapter: 2 }],
      remainingChapters: 1,
      ...overrides,
    }));
  }

  it('blocks when the promise is old and the book is nearly out of chapters', () => {
    const finding = gate().find(item => item.code === 'promise-ageing');
    expect(finding?.severity).toBe('blocking');
    expect(finding?.detail).toMatch(/Corin will return/);
  });

  it('only advises while there are still chapters to keep it in', () => {
    const finding = gate({ remainingChapters: 5 }).find(item => item.code === 'promise-ageing');
    expect(finding?.severity).toBe('advisory');
  });

  it('says nothing about a promise this chapter is keeping', () => {
    const keeping = plan({ chapter: 4, pressure_rung: 4, ending_change: 'Corin returns with the written terms and is paid in a flame that is not one.' });
    expect(gate({ plan: keeping }).map(item => item.code)).not.toContain('promise-ageing');
  });

  it('says nothing about a promise the book only just made', () => {
    expect(gate({ openThreads: [{ thread: standing, madeInChapter: 3 }] }).map(item => item.code)).not.toContain('promise-ageing');
  });

  it('reads the chapter a promise was made in from the scene that made it', () => {
    const store = new MemoryProjectStore();
    store.saveThreads([standing, { ...thread('CH01_S01-t1', 'kept'), status: 'resolved' }]);
    expect(openThreadsWithAge(store)).toEqual([{ thread: standing, madeInChapter: 2 }]);
  });
});

describe('what a call needs to know about the world', () => {
  const state: StoryState = {
    facts: [{ id: 'F1', statement: 'The temple keeps its novices lean.', evidence_refs: [] }],
    events: Array.from({ length: 90 }, (_, index) => ({ id: `E${index}`, description: `event ${index}`, participants: [], evidence_refs: [] })),
    conditions: { 'C01.location': 'the scrying room' },
    knowledge: { C01: Array.from({ length: 30 }, (_, index) => `learned ${index}`) },
    beliefs: { C01: ['The fire shows what is wanted.'] },
    reader_disclosures: Array.from({ length: 60 }, (_, index) => `shown ${index}`),
    names: [{ name: 'Aren', kind: 'person', refers_to: 'C01', aliases: [], first_seen: 'design' }],
  };

  it('keeps whole everything that answers a question', () => {
    const digest = stateDigest(state);
    // Facts are cited by id; conditions are the current world; names must be
    // exact or the writer invents spellings; beliefs are current, not a log.
    expect(digest.facts).toEqual(state.facts);
    expect(digest.conditions).toEqual(state.conditions);
    expect(digest.names).toEqual(state.names);
    expect(digest.beliefs).toEqual(state.beliefs);
  });

  it('trims only the three that accumulate, keeping the recent end', () => {
    const digest = stateDigest(state);
    expect(digest.events).toHaveLength(24);
    expect(digest.events.at(-1)?.description).toBe('event 89');
    expect(digest.reader_disclosures).toHaveLength(20);
    expect(digest.knowledge.C01).toHaveLength(8);
    expect(digest.knowledge.C01.at(-1)).toBe('learned 29');
  });

  it('says it is a digest, so nothing reasons as though the rest never happened', () => {
    const described = describeStateDigest(state);
    expect(described).toMatch(/24 most recent of 90 recorded events/);
    expect(described).toMatch(/Earlier events happened and still hold/);
    expect(described.length).toBeLessThan(JSON.stringify(state).length);
  });

  it('adds no note to a book short enough to fit whole', () => {
    const young = { ...state, events: state.events.slice(0, 5), reader_disclosures: [] };
    expect(describeStateDigest(young)).toBe(JSON.stringify(stateDigest(young)));
  });
});

describe('a budget the length of the book', () => {
  it('gives a long book more room than a short one', () => {
    // The wall used to be an hour whatever the book, set when a chapter was a
    // plan, a scene and an extraction. A chapter now also carries a
    // cross-encoder, an NLI pass and up to two replans.
    expect(budgetFor(10).maxTimeMs).toBeGreaterThan(budgetFor(3).maxTimeMs);
    expect(budgetFor(10).maxCalls).toBeGreaterThan(budgetFor(3).maxCalls);
  });

  it('never drops below the old hour for a short book', () => {
    expect(budgetFor(1).maxTimeMs).toBe(60 * 60 * 1000);
    expect(budgetFor(3).maxCalls).toBe(200);
  });

  it('still stops a runaway', () => {
    expect(budgetFor(100).maxTimeMs).toBe(4 * 60 * 60 * 1000);
    expect(budgetFor(100).maxCalls).toBe(600);
  });
});
