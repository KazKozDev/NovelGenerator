import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { BrowserProjectStore, emptyState, MemoryProjectStore } from '../utils/novel/v2/store';
import { buildSceneContext, checkReadiness } from '../utils/novel/v2/planner';
import { applyDelta, applyResolutions, applyThreads, backstopNames, mergeProperNames, resolveOpenQuestions, storyNames, trackScene } from '../utils/novel/v2/tracker';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { BookDesign, ProjectInput } from '../utils/novel/v2/types';

const input: ProjectInput = {
  premise: 'A lighthouse keeper finds a door in the sea.',
  chapter_count: 2,
  genre: 'mystery',
  target_total_words: 4000,
  author_requirements: '',
  story_language: 'English',
  planning_language: 'English',
};

function design(): BookDesign {
  return {
    contract: { explicit_requirements: [], inferred_decisions: [], language: 'English', tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'd', attention: 'a', register: 'r', humor: 'h', emotional_expression: 'e' },
    characters: [{ id: 'C01', name: 'Zor', story_function: 'keeper', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: ['The light must stay lit.'], initial_beliefs: [] }],
    world_rules: [],
    causal_map: [],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: [1, 2].map(n => ({
      chapter: n, function: 'f', main_change: 'm', event_ids: [], dependencies: [], setup_or_payoff: [], pov_id: 'C01', target_words: 2000,
    })),
  };
}

function plan(chapter: number) {
  return {
    status: 'ready',
    chapter,
    function: 'f',
    starting_situation: 's',
    ending_change: 'Zor finds the door.',
    scenes: [{
      id: `CH0${chapter}_S01`,
      pov_id: 'C01',
      location: 'Lighthouse',
      story_time: 'night',
      participants: ['C01'],
      initial_conditions: [],
      function: 'f',
      participant_intentions: [{ character_id: 'C01', intention: 'climb', reason_now: 'the light went out' }],
      pressure_or_uncertainty: 'storm',
      development: 'd',
      required_outcome: 'Zor reaches the lamp room.',
      flexible_elements: [],
      required_fact_refs: [],
      required_source_refs: [],
      setup_or_payoff: [],
      transition_to_next: '',
      target_words: 800,
    }],
    forward_dependencies: [],
    replan_reason: null,
  };
}

const PROSE = 'Zor climbed while the storm took the rail from her hands.\n\nThe lamp room smelled of hot glass and rain.';

function delta() {
  return {
    proper_names: [],
    name_variants: [],
    events: [{ description: 'Zor reaches the lamp room.', participants: ['C01'], evidence_refs: ['p1'] }],
    state_changes: [],
    knowledge_changes: [],
    belief_changes: [],
    intentions_and_commitments: [],
    reader_disclosures: [],
    threads_opened: [],
    threads_resolved: [],
    contradictions: [],
    uncertainties: [],
    plan_deviations: [],
  };
}

function forward() {
  return {
    chapter_outcome: 'Zor reaches the lamp room.',
    consequences_to_carry_forward: [],
    next_chapter_inputs: { starting_situation: 's', active_intentions: [], necessary_content: [], relevant_fact_refs: [], source_refs_to_retrieve: [] },
    plan_updates: [],
    ending_readiness: { established_requirements: [], remaining_requirements: [], capacity_problems: [] },
    unresolved_blockers: [],
  };
}

function audit() {
  return {
    coverage: { material_examined: 'full manuscript', limitations: [] },
    findings: [],
    central_resolution: { supported: true, evidence_refs: [], comment: 'ok' },
    unresolved_major_promises: [],
    need_more_evidence: [],
    summary: 'Clean.',
  };
}

function fullLlm(deltaReply: () => unknown = delta): NovelLLM {
  return vi.fn(async (prompt: string) => {
    if (prompt.includes('Prepare a compact book construction')) return JSON.stringify(design());
    if (prompt.includes('Check whether the provided plan is ready')) return JSON.stringify({ ready: true, issues: [] });
    if (prompt.includes('Plan only the current chapter')) {
      const chapter = prompt.includes('"chapter":2') || prompt.includes('Chapter:\n2 of') ? 2 : 1;
      return JSON.stringify(plan(chapter));
    }
    if (prompt.includes('Write a full literary scene')) return PROSE;
    if (prompt.includes('Extract the essential changes from the new scene')) return JSON.stringify(deltaReply());
    if (prompt.includes('Refine the forward plan')) return JSON.stringify(forward());
    if (prompt.includes('Check the integrity of the finished book')) return JSON.stringify(audit());
    throw new Error(`Unexpected stage: ${prompt.slice(0, 80)}`);
  });
}

describe('v2 chapter pipeline end to end', () => {
  it('writes two chapters from confirmed memory and audits clean', async () => {
    const store = new MemoryProjectStore();
    const result = await new Orchestrator(store, { maxCalls: 200, maxTimeMs: 60000 }, new ChapterPipelineV2())
      .runBook(input, fullLlm());
    expect(result.status).toBe('COMPLETE');
    expect(result.report?.status).toBe('COMPLETE');
    const manuscript = store.manuscript();
    expect(manuscript).toHaveLength(2);
    expect(manuscript[0].text).toContain('Zor climbed');
    // Knowledge seeded from the character card, events folded from the delta.
    expect(store.loadState().knowledge.C01).toContain('The light must stay lit.');
    expect(store.loadState().events).toHaveLength(2);
    expect(store.chapterScenes(1)).toHaveLength(1);
    expect(store.runLog().map(e => e.stage)).toContain('audit');
  });

  it('stops the book on a blocking contradiction instead of writing past it', async () => {
    const store = new MemoryProjectStore();
    const blocked = { ...delta(), contradictions: [{ description: 'Zor is in two places.', prior_refs: [], scene_refs: ['p1'], blocks_continuation: true }] };
    const result = await new Orchestrator(store, { maxCalls: 200, maxTimeMs: 60000 }, new ChapterPipelineV2())
      .runBook(input, fullLlm(() => blocked));
    expect(result.status).toBe('FAILED');
    expect(result.stoppedReason).toMatch(/contradicts confirmed state/);
    expect(store.manuscript()).toHaveLength(0);
  });

  it('restarts a partially written chapter from the snapshot', async () => {
    const store = new MemoryProjectStore();
    const llm = fullLlm();
    const pipeline = new ChapterPipelineV2();
    await pipeline.writeChapter(design(), 1, store, llm);
    // Simulate death between the scene save and the manuscript: chapter 2 holds
    // one scene and a folded delta, but no manuscript and no snapshot.
    store.saveScene({ id: 'CH02_S01', chapter: 2, prose: 'Partial.', paragraph_ids: ['p1'], plan: null, delta: null });
    const state = store.loadState();
    store.saveState({ ...state, events: [...state.events, { id: 'junk', description: 'unfinished', participants: [], evidence_refs: [] }] });
    expect(store.chapterScenes(2)).toHaveLength(1);

    const result = await new Orchestrator(store, { maxCalls: 500, maxTimeMs: 60000 }, new ChapterPipelineV2())
      .runBook(input, fullLlm());
    expect(result.status).toBe('COMPLETE');
    // The partial scene is gone, the junk delta with it; memory holds one event per chapter.
    expect(store.chapterScenes(2)).toHaveLength(1);
    expect(store.chapterScenes(2)[0].prose).toContain('Zor climbed');
    expect(store.loadState().events).toHaveLength(2);
    expect(store.manuscript()).toHaveLength(2);
  });

  it('flags pov, empty task and location gaps before prose', () => {
    const d = design();
    const base = plan(1).scenes[0];
    expect(checkReadiness(d, emptyState(), base)).toEqual([]);
    expect(checkReadiness(d, emptyState(), { ...base, pov_id: 'C99' })[0].code).toBe('pov-absent');
    expect(checkReadiness(d, emptyState(), { ...base, required_outcome: '', function: '' })[0].code).toBe('empty-task');
    const away = { ...emptyState(), conditions: { 'C01.location': 'Harbor' } };
    expect(checkReadiness(d, away, base)[0].code).toBe('location-mismatch');
    const home = { ...emptyState(), conditions: { 'C01.location': 'Lighthouse lamp room' } };
    expect(checkReadiness(d, home, base)).toEqual([]);
  });

  it('asks the review about a role instead of guessing or dying', () => {
    const d = design();
    d.characters = [
      ...d.characters,
      { id: 'C02', name: 'Paxel', story_function: 'brother who wants to sell', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] },
    ];
    const ctx = buildSceneContext(d, emptyState(), { ...plan(1).scenes[0], participants: ['C01', 'Antagonist'] }, '', []);
    expect(ctx.scene.participants).toEqual(['C01', 'Antagonist']);
    expect(ctx.problems.map(p => p.code)).toContain('unknown-participant');
    expect(ctx.vars.cast_roster).toMatch(/C02.*Paxel/);
  });

  it('sends unknown fact refs to review instead of killing the chapter', () => {
    const d = design();
    const scene = { ...plan(1).scenes[0], required_fact_refs: ['They have worked together for years.'] };
    const ctx = buildSceneContext(d, emptyState(), scene, '', []);
    expect(ctx.problems.map(p => p.code)).toContain('missing-fact');
    expect(ctx.vars.scene_plan).toContain('CH01_S01');
  });

  it('stitches a blocking verdict into the package instead of stopping the book', async () => {
    const store = new MemoryProjectStore();
    store.saveState({ ...emptyState(), conditions: { 'C01.location': 'Harbor' } });
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Check whether the provided plan is ready') && prompt.includes('readiness before prose')) {
        return JSON.stringify({ ready: false, issues: [{ id: 'I01', severity: 'blocking', target_ref: 'CH01_S01', category: 'causality', problem: 'No arrival shown', evidence_refs: [], consequence_for_writing: 'teleport', required_decision: 'Add the crossing', suggested_adjustment: 's' }] });
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    // Through the pipeline directly: the orchestrator would reset chapter 1 state first.
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(outcome.warnings.join(' ')).toMatch(/must establish: Add the crossing/);
    expect(store.manuscript()).toHaveLength(1);
  });

  it('retries a misquoting extraction once, then fails loudly', async () => {
    const prose = 'Zor climbed while the storm took the rail.\n\nThe lamp room smelled of hot glass.';
    const bad = { ...delta(), events: [{ description: 'x', participants: [], evidence_refs: ['p9'] }] };
    let calls = 0;
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(calls++ === 0 ? bad : delta()));
    const tracked = await trackScene({ story_language: 'English', planning_language: 'English', priorState: emptyState(), scenePlan: {}, sceneProse: prose, sourceExcerpts: [] }, llm);
    expect(tracked.events).toHaveLength(1);
    expect(calls).toBe(2);
    const stubborn: NovelLLM = vi.fn(async () => JSON.stringify(bad));
    await expect(trackScene({ story_language: 'English', planning_language: 'English', priorState: emptyState(), scenePlan: {}, sceneProse: prose, sourceExcerpts: [] }, stubborn)).rejects.toThrow(/points nowhere/);
  });

  it('backstops names the extraction missed from the prose itself', async () => {
    const prose = 'Zor heard the radio clearly through the static.\n\nStation Pax, this is the Zarka. Do you read?';
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(delta()));
    const tracked = await trackScene({ story_language: 'English', planning_language: 'English', priorState: emptyState(), scenePlan: {}, sceneProse: prose, sourceExcerpts: [] }, llm);
    const names = tracked.proper_names.map(item => item.name);
    expect(names).toContain('Zarka');
    expect(names).toContain('Station Pax');
    expect(names).toContain('Zor');
    const ship = tracked.proper_names.find(item => item.name === 'Zarka');
    expect(ship?.evidence_refs).toEqual(['p2']);
  });

  it('carries only cited paragraphs to the resolution call', async () => {
    const prose = 'Zor climbed while the storm took the rail.\n\nThe lamp room smelled of hot glass and rain.\n\nFar away the sea kept its own counsel about the door.';
    let sent = '';
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      sent = prompt;
      return JSON.stringify({ resolutions: [] });
    });
    await resolveOpenQuestions(prose, [{ question: 'q', evidence_refs: ['p1'] }], llm);
    expect(sent).toContain('Zor climbed');
    expect(sent).toContain('lamp room');
    expect(sent).not.toContain('own counsel');
  });

  it('keeps the chapter standing when the resolution call dies', async () => {
    const store = new MemoryProjectStore();
    const uncertain = { ...delta(), uncertainties: [{ question: 'Who rang?', evidence_refs: ['p1'], relevant_to_next_scene: true }] };
    const base = fullLlm(() => uncertain);
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('OPEN QUESTIONS')) throw new Error('Ollama output reached its token limit');
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(outcome.warnings.join(' ')).toMatch(/leaves open questions unresolved/);
    expect(store.manuscript()).toHaveLength(1);
    expect(store.loadState().events).toHaveLength(1);
  });

  it('folds answered questions into memory and leaves the rest out', async () => {
    const prose = 'Zor climbed while the storm took the rail.\n\nThe lamp room smelled of hot glass.';
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({ resolutions: [
      { question: 'q1', resolution: 'Zor knows the stairs', kind: 'knowledge', subject: 'C01', evidence_refs: ['p1'] },
      { question: 'q2', resolution: 'cannot tell', kind: 'unresolved', subject: '', evidence_refs: ['p9'] },
    ] }));
    const resolutions = await resolveOpenQuestions(prose, [
      { question: 'q1', evidence_refs: ['p1'] },
      { question: 'q2', evidence_refs: ['p1'] },
    ], llm);
    // The second answer cites a paragraph that does not exist: dropped, not guessed.
    expect(resolutions).toHaveLength(1);
    const state = applyResolutions(emptyState(), resolutions, 'CH01_S01');
    expect(state.knowledge.C01).toEqual(['Zor knows the stairs']);
    expect(state.facts).toHaveLength(0);
  });

  it('persists the project slot across store instances', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    } as Storage);
    try {
      const first = new BrowserProjectStore();
      first.saveInput(input);
      first.saveDesign(design());
      first.saveManuscript(1, 'Zor climbed.');
      first.saveState({ facts: [], events: [{ id: 'x', description: 'd', participants: [], evidence_refs: [] }], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [], names: [] });
      first.saveStateSnapshot(1, first.loadState());
      const second = new BrowserProjectStore();
      expect(second.restore()).toBe(true);
      expect(second.manuscript()).toEqual([{ chapter: 1, text: 'Zor climbed.' }]);
      expect(second.loadStateSnapshot(1)?.events).toHaveLength(1);
      second.clearAll();
      expect(new BrowserProjectStore().restore()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('folds belief changes and never stutters condition keys', () => {
    const withBelief = { ...delta(), belief_changes: [{ character_id: 'C01', previous_belief: 'The sea is empty.', new_belief: 'Something lives in the sea.', evidence_refs: ['p1'] }] };
    const state = { ...emptyState(), beliefs: { C01: ['The sea is empty.', 'The light must stay lit.'] } };
    const once = applyDelta(state, withBelief, 'CH01_S01').state;
    expect(once.beliefs.C01).toEqual(['The light must stay lit.', 'Something lives in the sea.']);
    // Replaying the same fold lands on the same memory instead of doubling it.
    const twice = applyDelta(once, withBelief, 'CH01_S01').state;
    expect(twice).toEqual(once);
  });

  it('registers unlinked spellings as new names without judging them', () => {
    const known = [{ name: 'Zarko', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }];
    const quiet = mergeProperNames(known, [{ name: 'Zarko', kind: 'ship', refers_to: '', evidence_refs: ['p1'] }], 'CH02_S01');
    expect(quiet.names).toHaveLength(1);
    // "Zarka" beside "Zarko" is meaning, not spelling: code registers,
    // the model's variant verdict blocks. No similarity heuristics in code.
    const added = mergeProperNames(known, [{ name: 'Zarka', kind: 'ship', refers_to: '', evidence_refs: ['p2'] }], 'CH02_S01');
    expect(added.names).toHaveLength(2);
  });

  it('turns the model variant verdict into continuity blockers', () => {
    const state = { ...emptyState(), names: [{ name: 'Zarko', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }] };
    const flagged = { ...delta(), name_variants: [{ used: 'Zarka', recorded: 'Zarko', evidence_refs: ['p2'] }] };
    const applied = applyDelta(state, flagged, 'CH02_S01');
    expect(applied.blockers).toHaveLength(1);
    expect(applied.blockers[0]).toMatch(/Zarka.*Zarko/);
    expect(applied.state.names).toHaveLength(1);
  });

  it('merges possessives and leaves different skeletons alone', () => {
    const folded = [{ name: "Zor's", kind: 'person', refers_to: 'C01', aliases: [], first_seen: 'CH01_S01' }];
    const merged = mergeProperNames(folded, [{ name: 'Zor', kind: 'person', refers_to: '', evidence_refs: ['p1'] }], 'CH01_S01');
    expect(merged.names).toHaveLength(1);
    const split = mergeProperNames(
      [{ name: 'Vex', kind: 'thing', refers_to: '', aliases: [], first_seen: 'CH01_S01' }],
      [{ name: 'Vem', kind: 'person', refers_to: '', evidence_refs: ['p1'] }], 'CH01_S01');
    expect(split.names).toHaveLength(2);
  });

  it('folds mid-span possessives to one registry entry', () => {
    const known = [{ name: "Zor's Pax", kind: 'place', refers_to: '', aliases: [], first_seen: 'CH01_S01' }];
    const merged = mergeProperNames(known, [{ name: 'Zor Pax', kind: 'place', refers_to: '', evidence_refs: ['p3'] }], 'CH01_S01');
    expect(merged.names).toHaveLength(1);
  });

  it('registers a declared distinct thing without drift', () => {
    const known = [{ name: 'Zoran', kind: 'person', refers_to: 'C04', aliases: [], first_seen: 'CH01_S01' }];
    const distinct = mergeProperNames(known,
      [{ name: 'Zoren', kind: 'person', refers_to: 'C05', evidence_refs: ['p1'] }], 'CH01_S02');
    expect(distinct.names).toHaveLength(2);
  });

  it('links diminutives via refers_to and leaves short names alone', () => {
    const known = [{ name: 'Paxel', kind: 'person', refers_to: 'C02', aliases: [], first_seen: 'design' }];
    const linked = mergeProperNames(known, [{ name: 'Pax', kind: 'person', refers_to: 'Paxel', evidence_refs: ['p1'] }], 'CH01_S01');
    expect(linked.names[0].aliases).toEqual(['Pax']);
    const short = mergeProperNames([], [{ name: 'Zor', evidence_refs: ['p1'] }, { name: 'Zora', evidence_refs: ['p2'] }], 'CH01_S01');
    expect(short.names).toHaveLength(2);
  });

  it('blocks an undeclared near-twin spelling end to end', async () => {
    // Chapter 1 established the ship as Zarko. Chapter 2 writes Zarka.
    // The model verdict — not code similarity — names the variant,
    // and the line blocks.
    const priorState = { ...emptyState(), names: [{ name: 'Zarko', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }] };
    const radio = 'Station Pax, Station Pax. This is the Zarka. Do you read?';
    let sent = '';
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      sent = prompt;
      return JSON.stringify({ ...delta(), name_variants: [{ used: 'Zarka', recorded: 'Zarko', evidence_refs: ['p1'] }] });
    });
    const tracked = await trackScene({ story_language: 'English', planning_language: 'English', priorState, scenePlan: {}, sceneProse: radio, sourceExcerpts: [] }, llm);
    expect(sent).toMatch(/Zarko/);
    const applied = applyDelta(priorState, tracked, 'CH02_S01');
    expect(applied.blockers.join(' ')).toMatch(/Zarka.*Zarko/);
  });

  it('shows the registry in the writer package, verbatim', () => {
    const state = { ...emptyState(), names: [{ name: 'Zarko', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }] };
    const ctx = buildSceneContext(design(), state, plan(1).scenes[0], '', []);
    expect(ctx.vars.named_entities).toMatch(/Zarko/);
    const fresh = buildSceneContext(design(), emptyState(), plan(1).scenes[0], '', []);
    expect(fresh.vars.named_entities).toMatch(/no named entities/);
    expect(storyNames({} as unknown as Parameters<typeof storyNames>[0])).toEqual([]);
  });

  it('decays old knowledge out of the writer package, newest kept', () => {
    const notes = Array.from({ length: 12 }, (_, i) => `note ${i + 1}`);
    const state = { ...emptyState(), knowledge: { C01: notes } };
    const pack = JSON.parse(buildSceneContext(design(), state, plan(1).scenes[0], '', []).vars.character_knowledge_and_beliefs) as Record<string, { knows: string[] }>;
    expect(pack.C01.knows).toHaveLength(8);
    expect(pack.C01.knows[7]).toBe('note 12');
    expect(pack.C01.knows).not.toContain('note 1');
  });

  it('flags a scene whose outcome restates its setup', () => {
    const restating = {
      ...plan(1).scenes[0],
      function: 'The three stand in the kitchen deciding nothing',
      development: 'They stand in silence',
      required_outcome: 'They stand in the kitchen in silence',
    };
    expect(checkReadiness(design(), emptyState(), restating).map(p => p.code)).toContain('static-outcome');
    const moving = { ...plan(1).scenes[0], function: 'f', development: 'd', required_outcome: 'Zor reaches the lamp room.' };
    expect(checkReadiness(design(), emptyState(), moving).map(p => p.code)).not.toContain('static-outcome');
  });

  it('keeps entity-qualified condition keys from doubling', () => {
    const moved = { ...delta(), state_changes: [{ entity_id: 'C01.location', field: 'location', before: null, after: 'Lamp room', evidence_refs: ['p1'] }] };
    const state = applyDelta(emptyState(), moved, 'CH01_S01').state;
    expect(state.conditions['C01.location']).toBe('Lamp room');
    expect(state.conditions['C01.location.location']).toBeUndefined();
  });

  it('resolves threads cited in words and never pays the same thread twice', () => {
    const threads = [{ id: 'CH01_S01-t1', description: 'Will Zor find the door?', status: 'open' as const, setup_refs: ['CH01_S01'], payoff_refs: [] as string[] }];
    const payoff = { ...delta(), threads_resolved: [{ thread: 'Will Zor find the door?' }] };
    const once = applyThreads(threads, payoff, 'CH01_S01');
    expect(once[0].status).toBe('resolved');
    expect(once[0].payoff_refs).toEqual(['CH01_S01']);
    const twice = applyThreads(once, payoff, 'CH01_S01');
    expect(twice).toEqual(once);
  });

  it('replays a finished scene from the draft instead of rewriting it', async () => {
    const store = new MemoryProjectStore();
    const pipeline = new ChapterPipelineV2();
    const llm = fullLlm();
    await pipeline.writeChapter(design(), 1, store, llm);
    const writes = vi.mocked(llm).mock.calls.filter(([prompt]) => prompt.includes('Write a full literary scene')).length;
    expect(writes).toBe(1);
    // Simulate a resume after the manuscript was lost: snapshot stands, the
    // finished scene and its plan are still stored.
    const snapshot = store.loadStateSnapshot(1);
    expect(snapshot).not.toBeNull();
    store.saveState(snapshot!);
    const callsBefore = vi.mocked(llm).mock.calls.length;
    await pipeline.writeChapter(design(), 1, store, llm);
    const rewrites = vi.mocked(llm).mock.calls.slice(callsBefore)
      .filter(([prompt]) => prompt.includes('Write a full literary scene') || prompt.includes('Extract the essential changes from the new scene')).length;
    expect(rewrites).toBe(0);
    expect(store.loadState().events).toHaveLength(1);
    expect(store.manuscript()).toHaveLength(1);
    expect(store.runLog().some(e => e.detail.includes('replayed from the stored draft'))).toBe(true);
  });

  it('rewrites a scene once on a blocking contradiction instead of killing the book', async () => {
    const store = new MemoryProjectStore();
    const blocked = { ...delta(), contradictions: [{ description: 'Zor was elsewhere.', prior_refs: [], scene_refs: ['p1'], blocks_continuation: true }] };
    let extractions = 0;
    const base = fullLlm(() => (extractions++ === 0 ? blocked : delta()));
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Write a full literary scene') && extractions > 0) {
        expect(prompt).toMatch(/Do not contradict confirmed state/);
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(store.manuscript()).toHaveLength(1);
    expect(outcome.warnings.join(' ')).toMatch(/rewritten/);
    expect(store.loadState().events).toHaveLength(1);
  });

  it('fails loudly when the rewrite breaks continuity again', async () => {
    const store = new MemoryProjectStore();
    const blocked = { ...delta(), contradictions: [{ description: 'Zor was elsewhere.', prior_refs: [], scene_refs: ['p1'], blocks_continuation: true }] };
    await expect(new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm(() => blocked)))
      .rejects.toThrow(/contradicts confirmed state/);
  });

  it('diverts a restaged scene to review before any prose exists', async () => {
    const store = new MemoryProjectStore();
    store.saveManuscript(1, 'The lamp room held its light over the stairs. Zor watched.');
    const echoPlan = {
      ...plan(2),
      scenes: [{
        ...plan(2).scenes[0],
        location: 'Lamp room',
        function: 'An uneasy night together.',
        development: 'The lamp room held its light while they waited.',
        required_outcome: 'They wait by the lamp.',
      }],
    };
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Plan only the current chapter')) return JSON.stringify(echoPlan);
      if (prompt.includes('Check whether the provided plan is ready') && prompt.includes('restaging-suspect')) {
        return JSON.stringify({ ready: false, issues: [{ id: 'I01', severity: 'blocking', target_ref: 'CH02_S01', category: 'originality', problem: 'Lamp-room staging repeats chapter 1', evidence_refs: [], consequence_for_writing: 'restaging', required_decision: 'Differentiate the staging on the page', suggested_adjustment: 's' }] });
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    expect(outcome.warnings.join(' ')).toMatch(/must establish: Differentiate the staging/);
    expect(store.manuscript()).toHaveLength(2);
    expect(store.manuscript().find(item => item.chapter === 2)?.text).toContain('Zor climbed');
  });

  it('carries semantic gate suspicions into the plan review', async () => {
    const store = new MemoryProjectStore();
    const stubGate = async () => ({
      problems: new Map([['CH01_S01', [{ code: 'clash-suspect' as const, detail: 'Plan states the lamp is lit but confirmed state holds it is dark.' }]]]),
      warnings: [] as string[],
      mode: 'full' as const,
    });
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('lamp is lit')) {
        return JSON.stringify({ ready: false, issues: [{ id: 'I01', severity: 'major', target_ref: 'CH01_S01', category: 'continuity', problem: 'Lamp state clash', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'Show the lamp dark on the page', suggested_adjustment: 's' }] });
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm, stubGate);
    expect(outcome.warnings.join(' ')).toMatch(/Show the lamp dark/);
    expect(store.manuscript()).toHaveLength(1);
  });

  it('refuses a chapter the plan itself declares unplannable', async () => {
    const store = new MemoryProjectStore();
    const llm = fullLlm();
    const base = vi.mocked(llm);
    const result = await new Orchestrator(store, { maxCalls: 200, maxTimeMs: 60000 }, new ChapterPipelineV2())
      .runBook(input, vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Plan only the current chapter')) {
          return JSON.stringify({ ...plan(1), status: 'needs_replan', scenes: [], replan_reason: 'State contradicts the map.' });
        }
        return base(prompt, system, options);
      }));
    expect(result.status).toBe('FAILED');
    expect(result.stoppedReason).toMatch(/cannot be written as planned/);
  });
});
