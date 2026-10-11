import { designReply } from './designReplies';
import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { BrowserProjectStore, emptyState, MemoryProjectStore } from '../utils/novel/v2/store';
import { buildSceneContext, checkReadiness, rebaseScenePlan } from '../utils/novel/v2/planner';
import { applyForwardToHandoff, buildSceneHandoff, plannerHandoff, writerHandoff } from '../utils/novel/v2/handoff';
import { alignSpellings } from '../utils/novel/v2/repair';
import { readEndingReadiness, remainingEndingRequirements } from '../utils/novel/v2/forward';
import { resolveSourceRefs } from '../utils/novel/v2/retrieval';
import { describeShapes, recentShapes, repeatedStaging, sceneShape } from '../utils/novel/v2/shapes';
import { openThreadsWithAge } from '../utils/novel/v2/ledger';
import { describeRelations, parseRelation, relationsFor } from '../utils/novel/v2/relationships';
import { applyDelta, applyResolutions, applyThreads, backstopNames, mergeProperNames, paragraphsWithIds, resolveOpenQuestions, storyNames, trackScene } from '../utils/novel/v2/tracker';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { BookDesign, ProjectInput } from '../utils/novel/v2/types';

const input: ProjectInput = {
  generation_mode: 'chapters',
  premise: 'A lighthouse keeper finds a door in the sea.',
  chapter_count: 2,
  genre: 'mystery',
  target_total_words: 4000,
  author_requirements: '',
};

function design(): BookDesign {
  return {
    contract: { premise_givens: [], premise_names: [], working_title: 'A Working Title', explicit_requirements: [], inferred_decisions: [], tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    profile: {
      pressure_curve: 'rising' as const,
      curve_reason: 'the sea closes in',
      declared_motifs: [],
      cost_kinds: ['a light that goes out'],
      dialogue_weight: 'medium' as const,
      staging_variety: 'medium' as const,
      mechanism_reuse: 'medium' as const,
      open_ending: false,
      mechanism_ledger: ['climb to the lamp', 'open the door', 'wait out the storm', 'read the log'],
      ending_invariants: ['the door is explained'],
    },
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'd', attention: 'a', register: 'r', humor: 'h', emotional_expression: 'e' },
    characters: [{ id: 'C01', name: 'Aren', story_function: 'keeper', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: ['The light must stay lit.'], initial_beliefs: [] }],
    world_rules: [
      { id: 'R01', rule: 'The tower has three floors and the lamp room is the top one.', relevant_consequences: [], subject: 'the tower', attribute: 'floors' },
      { id: 'R02', rule: 'Accounts are kept by hand in bound books.', relevant_consequences: [], subject: 'the accounts', attribute: 'how kept' },
      { id: 'R03', rule: 'The story takes four days in late autumn.', relevant_consequences: [], subject: 'the story', attribute: 'span' },
      { id: 'R04', rule: 'The keeper has kept the light since boyhood.', relevant_consequences: [], subject: 'the keeper', attribute: 'length of service' },
      { id: 'R05', rule: 'The oil store is the stone shed at the foot of the tower.', relevant_consequences: [], subject: 'the oil store', attribute: 'place' },
      { id: 'R06', rule: 'Wages are paid quarterly in coin by the harbour board.', relevant_consequences: [], subject: 'wages', attribute: 'how paid' },
      { id: 'R07', rule: 'The log book lists each night by date, hours of light and oil used.', relevant_consequences: [], subject: 'the log book', attribute: 'contents' },
      { id: 'R08', rule: 'The nearest village is two miles off along the shore path.', relevant_consequences: [], subject: 'the village', attribute: 'distance' },
    ],
    causal_map: [{ id: 'E01', actor_id: 'C01', cause: 'The storm interrupts the light', action_or_event: 'Aren climbs to the lamp', consequence: 'She can restore the light', requires: [], enables: [] }],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: [1, 2].map(n => ({
      chapter: n, function: 'f', main_change: 'm', event_ids: ['E01'], dependencies: [], setup_or_payoff: [], pov_id: 'C01', target_words: 2000,
      mechanism: n === 1 ? 'climb to the lamp' : 'open the door', cost: 'the light goes out', pressure_rung: n,
    })),
  };
}

function plan(chapter: number) {
  return {
    status: 'ready',
    chapter,
    function: 'f',
    starting_situation: 's',
    ending_change: 'Aren finds the door.',
    mechanism: chapter === 1 ? 'climb to the lamp' : 'open the door',
    cost: 'the light goes out',
    pressure_rung: chapter,
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
      required_outcome: 'Aren reaches the upper room.',
      flexible_elements: [],
      required_fact_refs: [],
      required_source_refs: [],
      setup_or_payoff: [],
      transition_to_next: '',
      target_words: 800,
      outcome_kind: 'position',
    }],
    forward_dependencies: [],
    replan_reason: null,
  };
}

const PROSE = 'Aren climbed while the storm took the rail from her hands.\n\nThe upper room smelled of hot glass and rain.';
// Chapter two repeats one sentence of chapter one and says something new in the
// other: exactly the case span repair exists for, and the case where rewriting
// the whole scene would be the wrong answer.
const PROSE_2 = 'The upper room smelled of hot glass and rain.\n\nBelow the gallery the outer door stood open on nothing at all.';

function delta() {
  return {
    proper_names: [],
    name_variants: [],
    events: [{ description: 'Aren reaches the upper room.', participants: ['C01'], evidence_refs: ['p1'] }],
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
    chapter_outcome: 'Aren reaches the upper room.',
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
    const reply = designReply(prompt, design());
    if (reply) return reply;
    if (prompt.includes('Prepare a compact book construction')) return JSON.stringify(design());
    if (prompt.includes('Check whether the provided plan is ready')) return JSON.stringify({ ready: true, issues: [] });
    if (prompt.includes('Plan only the current chapter')) {
      const chapter = prompt.includes('"chapter":2') || prompt.includes('Chapter:\n2 of') ? 2 : 1;
      return JSON.stringify(plan(chapter));
    }
    if (prompt.includes('Update the next scene plan against the explicit handoff')) {
      const match = prompt.match(/Original scene plan:\n(\{[^\n]+\})/);
      const scene = match ? JSON.parse(match[1]) : plan(2).scenes[0];
      if (prompt.includes('"previous_outcome":"Aren reaches the upper room."')) {
        scene.required_outcome = 'Aren commits to opening the outer door.';
      }
      return JSON.stringify(scene);
    }
    if (prompt.includes('Write a full literary scene')) {
      return prompt.includes('CH02_S01') ? PROSE_2 : PROSE;
    }
    if (prompt.includes('Rewrite the listed sentences')) {
      // The fixture writes the same prose twice on purpose, so the repair fires.
      // It answers the way the contract asks: same information, different words.
      return JSON.stringify({
        replacements: [{
          original: 'The upper room smelled of hot glass and rain.',
          replacement: 'Hot glass and rain were the whole smell of the upper room.',
          refused_because: '',
        }],
      });
    }
    if (prompt.includes('Extract the essential changes from the new scene')) return JSON.stringify(deltaReply());
    if (prompt.includes('Refine the forward plan')) return JSON.stringify(forward());
    if (prompt.includes('Check the integrity of the finished book')) return JSON.stringify(audit());
    throw new Error(`Unexpected stage: ${prompt.slice(0, 80)}`);
  });
}

describe('v2 chapter pipeline end to end', () => {
  it('writes two chapters from confirmed memory and audits clean', async () => {
    const store = new MemoryProjectStore();
    const llm = fullLlm();
    const result = await new Orchestrator(store, { maxCalls: 200, maxTimeMs: 60000 }, new ChapterPipelineV2())
      .runBook(input, llm);
    expect(result.status, result.stoppedReason).toBe('COMPLETE');
    expect(result.report?.status).toBe('COMPLETE');
    const manuscript = store.manuscript();
    expect(manuscript).toHaveLength(2);
    expect(manuscript[0].text).toContain('Aren climbed');
    // Knowledge seeded from the character card, events folded from the delta.
    expect(store.loadState().knowledge.C01).toContain('The light must stay lit.');
    expect(store.loadState().events).toHaveLength(2);
    expect(store.chapterScenes(1)).toHaveLength(1);
    expect(store.runLog().map(e => e.stage)).toContain('audit');
    expect(vi.mocked(llm).mock.calls.some(([prompt]) => prompt.includes('STATE HANDOFF FROM ACCEPTED PROSE')
      && prompt.includes('Aren reaches the upper room.'))).toBe(true);
  });

  it('keeps a finished book when only its final audit fails', async () => {
    const store = new MemoryProjectStore();
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Check the integrity of the finished book')) throw new Error('Ollama output reached its token limit; the incomplete response was rejected.');
      return (base as NovelLLM)(prompt, system, options);
    });
    const result = await new Orchestrator(store, { maxCalls: 200, maxTimeMs: 60000 }, new ChapterPipelineV2()).runBook(input, llm);
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(result.report).toBeNull();
    expect(result.stoppedReason).toMatch(/final audit could not be completed \(Ollama output reached its token limit/);
    expect(store.manuscript()).toHaveLength(2);
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
    expect(result.status, result.stoppedReason).toBe('COMPLETE');
    // The partial scene is gone, the junk delta with it; memory holds one event per chapter.
    expect(store.chapterScenes(2)).toHaveLength(1);
    expect(store.chapterScenes(2)[0].prose).toContain('the outer door stood open');
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
    const home = { ...emptyState(), conditions: { 'C01.location': 'Lighthouse upper room' } };
    expect(checkReadiness(d, home, base)).toEqual([]);
  });

  it('asks the review about a role instead of guessing or dying', () => {
    const d = design();
    d.characters = [
      ...d.characters,
      { id: 'C02', name: 'Miroven', story_function: 'brother who wants to sell', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] },
    ];
    const ctx = buildSceneContext(d, emptyState(), { ...plan(1).scenes[0], participants: ['C01', 'Antagonist'] }, '', []);
    expect(ctx.scene.participants).toEqual(['C01', 'Antagonist']);
    expect(ctx.problems.map(p => p.code)).toContain('unknown-participant');
    expect(ctx.vars.cast_roster).toMatch(/C02.*Miroven/);
  });

  it('sends unknown fact refs to review instead of killing the chapter', () => {
    const d = design();
    const scene = { ...plan(1).scenes[0], required_fact_refs: ['They have worked together for years.'] };
    const ctx = buildSceneContext(d, emptyState(), scene, '', []);
    expect(ctx.problems.map(p => p.code)).toContain('missing-fact');
    expect(ctx.vars.scene_plan).toContain('CH01_S01');
  });

  it('tells the writer to show the move when a character is recorded somewhere else, without asking the editor', async () => {
    const store = new MemoryProjectStore();
    store.saveState({ ...emptyState(), conditions: { 'C01.location': 'Harbor' } });
    const llm = fullLlm();
    // Through the pipeline directly: the orchestrator would reset chapter 1 state first.
    await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    const prompts = vi.mocked(llm).mock.calls.map(([prompt]) => prompt);
    expect(prompts.some(prompt => prompt.includes('Code-level doubts'))).toBe(false);
    const written = prompts.find(prompt => prompt.includes('Write a full literary scene'))!;
    expect(written).toContain('C01 was recorded at \\"Harbor\\" and the scene is set at \\"Lighthouse\\" with no recorded move.');
    expect(written).toContain('Open by showing how they came to be here');
    expect(store.runLog().some(entry => entry.stage === 'readiness' && /location-mismatch/.test(entry.detail))).toBe(true);
    expect(store.manuscript()).toHaveLength(1);
  });

  it('retries a misquoting extraction once, then fails loudly', async () => {
    const prose = 'Aren climbed while the storm took the rail.\n\nThe upper room smelled of hot glass.';
    const bad = { ...delta(), events: [{ description: 'x', participants: [], evidence_refs: ['p9'] }] };
    let calls = 0;
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(calls++ === 0 ? bad : delta()));
    const tracked = await trackScene({ priorState: emptyState(), scenePlan: {}, sceneProse: prose, sourceExcerpts: [], openThreads: [] }, llm);
    expect(tracked.events).toHaveLength(1);
    expect(calls).toBe(2);
    const stubborn: NovelLLM = vi.fn(async () => JSON.stringify(bad));
    await expect(trackScene({ priorState: emptyState(), scenePlan: {}, sceneProse: prose, sourceExcerpts: [], openThreads: [] }, stubborn)).rejects.toThrow(/points nowhere/);
  });

  it('backstops names the extraction missed from the prose itself', async () => {
    // Each name occurs where a capital is not compulsory, which is what marks it
    // as a name rather than the first word of a sentence.
    const prose = 'The radio came through clearly for Aren despite the static.\n\nThis is Marn Relay calling the Kessel. Do you read?';
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(delta()));
    const tracked = await trackScene({ priorState: emptyState(), scenePlan: {}, sceneProse: prose, sourceExcerpts: [], openThreads: [] }, llm);
    const names = tracked.proper_names.map(item => item.name);
    expect(names).toContain('Kessel');
    expect(names).toContain('Marn Relay');
    expect(names).toContain('Aren');
    const ship = tracked.proper_names.find(item => item.name === 'Kessel');
    expect(ship?.evidence_refs).toEqual(['p2']);
  });

  it('carries only cited paragraphs to the resolution call', async () => {
    const prose = 'Aren climbed while the storm took the rail.\n\nThe upper room smelled of hot glass and rain.\n\nFar away the sea kept its own counsel about the door.';
    let sent = '';
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      sent = prompt;
      return JSON.stringify({ resolutions: [] });
    });
    await resolveOpenQuestions(prose, [{ question: 'q', evidence_refs: ['p1'] }], llm);
    expect(sent).toContain('Aren climbed');
    expect(sent).toContain('upper room');
    expect(sent).not.toContain('own counsel');
  });

  it('carries what a scene left open to the next one without a call to settle it', async () => {
    const store = new MemoryProjectStore();
    const uncertain = { ...delta(), uncertainties: [{ question: 'Who rang?', evidence_refs: ['p1'], relevant_to_next_scene: true }] };
    const llm = fullLlm(() => uncertain);
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(vi.mocked(llm).mock.calls.some(([prompt]) => prompt.includes('OPEN QUESTIONS'))).toBe(false);
    expect(outcome.warnings).toEqual([]);
    expect(store.loadState().events).toHaveLength(1);
    expect(store.chapterScenes(1)[0].handoff?.open_questions).toContain('Who rang?');
  });

  it('folds answered questions into memory and leaves the rest out', async () => {
    const prose = 'Aren climbed while the storm took the rail.\n\nThe upper room smelled of hot glass.';
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({ resolutions: [
      { question: 'q1', resolution: 'Aren knows the stairs', kind: 'knowledge', subject: 'C01', evidence_refs: ['p1'] },
      { question: 'q2', resolution: 'cannot tell', kind: 'unresolved', subject: '', evidence_refs: ['p9'] },
    ] }));
    const resolutions = await resolveOpenQuestions(prose, [
      { question: 'q1', evidence_refs: ['p1'] },
      { question: 'q2', evidence_refs: ['p1'] },
    ], llm);
    // The second answer cites a paragraph that does not exist: dropped, not guessed.
    expect(resolutions).toHaveLength(1);
    const state = applyResolutions(emptyState(), resolutions, 'CH01_S01');
    expect(state.knowledge.C01).toEqual(['Aren knows the stairs']);
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
      first.saveManuscript(1, 'Aren climbed.');
      first.saveState({ facts: [], events: [{ id: 'x', description: 'd', participants: [], evidence_refs: [] }], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [], names: [] });
      first.saveStateSnapshot(1, first.loadState());
      const second = new BrowserProjectStore();
      expect(second.restore()).toBe(true);
      expect(second.manuscript()).toEqual([{ chapter: 1, text: 'Aren climbed.' }]);
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
    const known = [{ name: 'Kessen', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }];
    const quiet = mergeProperNames(known, [{ name: 'Kessen', kind: 'ship', refers_to: '', evidence_refs: ['p1'] }], 'CH02_S01');
    expect(quiet.names).toHaveLength(1);
    // "Kessel" beside "Kessen" is meaning, not spelling: code registers,
    // the model's variant verdict blocks. No similarity heuristics in code.
    const added = mergeProperNames(known, [{ name: 'Kessel', kind: 'ship', refers_to: '', evidence_refs: ['p2'] }], 'CH02_S01');
    expect(added.names).toHaveLength(2);
  });

  it('hands a variant verdict back as a spelling to put right, not as a reason to rewrite the scene', () => {
    const state = { ...emptyState(), names: [{ name: 'Kessen', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }] };
    const flagged = { ...delta(), name_variants: [{ used: 'Kessel', recorded: 'Kessen', evidence_refs: ['p2'] }] };
    const applied = applyDelta(state, flagged, 'CH02_S01');
    expect(applied.blockers).toEqual([]);
    expect(applied.variants).toEqual([{ used: 'Kessel', recorded: 'Kessen' }]);
    expect(applied.state.names).toHaveLength(1);
  });

  it('respells a variant by whole word and leaves a longer name that contains it alone', () => {
    const fixed = alignSpellings('The Kessel answered. Kessel\'s lamp was out; the Kesselring did not answer.', [{ used: 'Kessel', recorded: 'Kessen' }]);
    expect(fixed.prose).toBe('The Kessen answered. Kessen\'s lamp was out; the Kesselring did not answer.');
    expect(fixed.changed).toEqual([{ used: 'Kessel', recorded: 'Kessen', places: 2 }]);
  });

  it('merges possessives and leaves different skeletons alone', () => {
    const folded = [{ name: "Aren's", kind: 'person', refers_to: 'C01', aliases: [], first_seen: 'CH01_S01' }];
    const merged = mergeProperNames(folded, [{ name: 'Aren', kind: 'person', refers_to: '', evidence_refs: ['p1'] }], 'CH01_S01');
    expect(merged.names).toHaveLength(1);
    const split = mergeProperNames(
      [{ name: 'Vex', kind: 'thing', refers_to: '', aliases: [], first_seen: 'CH01_S01' }],
      [{ name: 'Vem', kind: 'person', refers_to: '', evidence_refs: ['p1'] }], 'CH01_S01');
    expect(split.names).toHaveLength(2);
  });

  it('folds mid-span possessives to one registry entry', () => {
    const known = [{ name: "Aren's Miro", kind: 'place', refers_to: '', aliases: [], first_seen: 'CH01_S01' }];
    const merged = mergeProperNames(known, [{ name: 'Aren Miro', kind: 'place', refers_to: '', evidence_refs: ['p3'] }], 'CH01_S01');
    expect(merged.names).toHaveLength(1);
  });

  it('registers a declared distinct thing without drift', () => {
    const known = [{ name: 'Aleth', kind: 'person', refers_to: 'C04', aliases: [], first_seen: 'CH01_S01' }];
    const distinct = mergeProperNames(known,
      [{ name: 'Aleph', kind: 'person', refers_to: 'C05', evidence_refs: ['p1'] }], 'CH01_S02');
    expect(distinct.names).toHaveLength(2);
  });

  it('links diminutives via refers_to and leaves short names alone', () => {
    const known = [{ name: 'Miroven', kind: 'person', refers_to: 'C02', aliases: [], first_seen: 'design' }];
    const linked = mergeProperNames(known, [{ name: 'Miro', kind: 'person', refers_to: 'Miroven', evidence_refs: ['p1'] }], 'CH01_S01');
    expect(linked.names[0].aliases).toEqual(['Miro']);
    const short = mergeProperNames([], [{ name: 'Aren', evidence_refs: ['p1'] }, { name: 'Arel', evidence_refs: ['p2'] }], 'CH01_S01');
    expect(short.names).toHaveLength(2);
  });

  it('puts an undeclared near-twin spelling right in the text, with no second writing call', async () => {
    // Chapter 1 established the ship as Kessen. Chapter 2 writes Kessel. The
    // model verdict — not code similarity — names the variant, and code
    // carries it out as what it is: a spelling.
    const store = new MemoryProjectStore();
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm());
    store.saveState({ ...store.loadState(), names: [...store.loadState().names, { name: 'Kessen', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S01' }] });
    const base = fullLlm(() => ({ ...delta(), name_variants: [{ used: 'Kessel', recorded: 'Kessen', evidence_refs: ['p1'] }] }));
    const sent: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Write a full literary scene')) return 'The Kessel stood off the rock.\n\nBelow the gallery the outer door stood open on nothing at all.';
      if (prompt.includes('Extract the essential changes from the new scene')) sent.push(prompt);
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    expect(sent[0]).toMatch(/Kessen/);
    expect(vi.mocked(llm).mock.calls.filter(([prompt]) => prompt.includes('Write a full literary scene'))).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(store.manuscript()[1].text).toContain('The Kessen stood off the rock.');
    expect(outcome.warnings.join(' ')).toMatch(/"Kessel" was respelt "Kessen" in 1 place\(s\)/);
  });

  it('shows the registry in the writer package, verbatim', () => {
    const state = { ...emptyState(), names: [{ name: 'Kessen', kind: 'ship', refers_to: '', aliases: [], first_seen: 'CH01_S02' }] };
    const ctx = buildSceneContext(design(), state, plan(1).scenes[0], '', []);
    expect(ctx.vars.named_entities).toMatch(/Kessen/);
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
    const moving = { ...plan(1).scenes[0], function: 'f', development: 'd', required_outcome: 'Aren reaches the upper room.' };
    expect(checkReadiness(design(), emptyState(), moving).map(p => p.code)).not.toContain('static-outcome');
  });

  it('builds an explicit handoff with accepted changes and unresolved questions', () => {
    const changed = {
      ...delta(),
      events: [{ description: 'Aren opens the outer door.', participants: ['C01'], evidence_refs: ['p1'] }],
      reader_disclosures: ['The door answers to the lamp.'],
      uncertainties: [{ question: 'Who built the door?', evidence_refs: ['p1'], relevant_to_next_scene: true }],
    };
    const state = applyDelta(emptyState(), changed, 'CH01_S01').state;
    const handoff = buildSceneHandoff({
      scene: plan(1).scenes[0],
      nextScene: { ...plan(1).scenes[0], id: 'CH01_S02', required_outcome: 'Aren crosses the threshold.' },
      state,
      delta: changed,
      resolutions: [{ question: 'Who built the door?', resolution: 'The text does not say.', kind: 'unresolved', subject: '', evidence_refs: ['p1'] }],
      threads: [],
    });
    expect(handoff.previous_outcome).toBe('Aren opens the outer door.');
    expect(handoff.known_to_reader).toContain('The door answers to the lamp.');
    expect(handoff.open_questions).toContain('Who built the door?');
    expect(handoff.required_new_outcome).toBe('Aren crosses the threshold.');
    expect(handoff.forbidden_restatements).toContain('Aren opens the outer door.');
  });

  it('puts the full handoff into the next writer package', () => {
    const handoff = {
      after_scene_id: 'CH01_S01',
      known_to_reader: ['The lamp is broken.'],
      confirmed_changes: ['Aren lost the key.'],
      current_conditions: { 'C01.location': 'Shore' },
      open_questions: ['Who rang the bell?'],
      active_intentions: ['C01: recover the key'],
      previous_outcome: 'Aren lost the key.',
      required_new_outcome: 'Aren finds a witness.',
      forbidden_restatements: ['The lamp is broken.'],
    };
    const ctx = buildSceneContext(design(), emptyState(), plan(1).scenes[0], '', [], [], handoff);
    expect(ctx.vars.state_handoff).toContain('Who rang the bell?');
    expect(ctx.vars.state_handoff).toContain('The lamp is broken.');
    expect(ctx.vars.state_handoff).toContain(plan(1).scenes[0].required_outcome);
  });

  it('rejects a rebased scene that repeats the accepted outcome and retries it', async () => {
    const original = { ...plan(1).scenes[0], id: 'CH01_S02', required_outcome: 'Aren reaches the upper room.' };
    const handoff = {
      after_scene_id: 'CH01_S01', known_to_reader: [], confirmed_changes: [], current_conditions: {},
      open_questions: [], active_intentions: [], previous_outcome: 'Aren reaches the upper room.',
      required_new_outcome: original.required_outcome, forbidden_restatements: [],
    };
    let calls = 0;
    const llm: NovelLLM = vi.fn(async () => JSON.stringify({
      ...original,
      required_outcome: calls++ === 0 ? 'Aren reaches the upper room.' : 'Aren gives the lamp key to Miro.',
    }));
    const rebased = await rebaseScenePlan({
      design: design(), scene: original, handoff, openThreads: [],
    }, llm);
    expect(rebased.required_outcome).toBe('Aren gives the lamp key to Miro.');
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('persists the forward outcome in the last scene handoff', async () => {
    const store = new MemoryProjectStore();
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm());
    const handoff = store.chapterScenes(1)[0].handoff;
    expect(handoff?.previous_outcome).toBe('Aren reaches the upper room.');
    expect(handoff?.known_to_reader).toContain('Aren reaches the upper room.');
  });

  it('normalizes object-shaped forward entries instead of calling trim on them', () => {
    const base = buildSceneHandoff({
      scene: plan(1).scenes[0], state: applyDelta(emptyState(), delta(), 'CH01_S01').state,
      delta: delta(), resolutions: [], threads: [],
    });
    const malformed = {
      ...forward(),
      consequences_to_carry_forward: [{ description: 'The lamp is now dark.' }],
      next_chapter_inputs: {
        ...forward().next_chapter_inputs,
        active_intentions: [{ character_id: 'C01', intention: 'Relight the lamp.' }],
        necessary_content: [{ content: 'Show the failed ignition.' }],
      },
      unresolved_blockers: [{ question: 'Who cut the fuel line?' }],
    } as unknown as ReturnType<typeof forward>;
    const result = applyForwardToHandoff(base, malformed);
    expect(result.confirmed_changes).toContain('The lamp is now dark.');
    expect(result.active_intentions).toContain('C01: Relight the lamp.');
    expect(result.required_new_outcome).toBe('Show the failed ignition.');
    expect(result.open_questions).toContain('Who cut the fuel line?');
  });

  it('reports malformed forward blockers as text instead of throwing on them', async () => {
    const store = new MemoryProjectStore();
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => (
      prompt.includes('Refine the forward plan')
        ? JSON.stringify({ ...forward(), unresolved_blockers: [{ question: 'Who cut the fuel line?' }] })
        : base(prompt, system, options)
    ));
    const { warnings } = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(warnings.join(' ')).toContain('Who cut the fuel line?');
    expect(warnings.join(' ')).not.toContain('[object Object]');
  });

  it('keeps one entry when an intention arrives with and without its reason', () => {
    const withReason = { ...plan(1).scenes[0], participant_intentions: [{ character_id: 'C01', intention: 'Relight the lamp.', reason_now: 'The dark grows.' }] };
    const carried = { ...delta(), intentions_and_commitments: [{ character_id: 'C01', intention: 'Relight the lamp.' }] };
    const handoff = buildSceneHandoff({
      scene: plan(1).scenes[0], nextScene: withReason, state: applyDelta(emptyState(), carried, 'CH01_S01').state,
      delta: carried, resolutions: [], threads: [],
    });
    expect(handoff.active_intentions).toEqual(['C01: Relight the lamp. (The dark grows.)']);
  });

  it('plans the next chapter against the ending requirements still standing', () => {
    const design2 = { ...design(), ending: { ...design().ending, required_setup: ['The key is cut.', 'Miro learns to swim.'] } };
    expect(remainingEndingRequirements(design2, null)).toEqual(['The key is cut.', 'Miro learns to swim.']);
    const readiness = readEndingReadiness({
      ...forward(),
      ending_readiness: {
        established_requirements: ['the key is cut'],
        remaining_requirements: [{ requirement: 'Someone must open the outer door.' }],
        capacity_problems: ['Two chapters left for three preparations.'],
      },
    } as unknown as ReturnType<typeof forward>);
    expect(readiness.remaining_requirements).toEqual(['Someone must open the outer door.']);
    // The design's list stays authoritative; the reading only retires and adds.
    expect(remainingEndingRequirements(design2, readiness))
      .toEqual(['Miro learns to swim.', 'Someone must open the outer door.']);
  });

  it('retires an ending requirement cited by id or retyped, and keeps one the reading never mentions', () => {
    const required = [
      'The keeper learns who cut the second key and why it was hidden (Chapter 1)',
      'Miro learns to swim well enough to reach the outer rock (Chapter 2)',
      'The lamp oil is counted and found short by a full week (Chapter 2)',
    ];
    const design3 = { ...design(), ending: { ...design().ending, required_setup: required } };
    const reading = (established: string[]) => ({ established_requirements: established, remaining_requirements: ['E3'], capacity_problems: [] });
    expect(remainingEndingRequirements(design3, reading(['E1', 'Miro learns to swim well enough to reach the outer rock.']))).toEqual([required[2]]);
    expect(remainingEndingRequirements(design3, reading(['The keeper learns who cut the second key, and why it was hidden']))).toEqual([required[1], required[2]]);
    expect(remainingEndingRequirements(design3, reading(['A storm closes the harbour']))).toEqual(required);
  });

  it('keeps the ending readiness and warns when the chapters left cannot carry it', async () => {
    const store = new MemoryProjectStore();
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => (
      prompt.includes('Refine the forward plan')
        ? JSON.stringify({
            ...forward(),
            ending_readiness: {
              established_requirements: ['The upper room is reachable.'],
              remaining_requirements: ['Someone must open the outer door.'],
              capacity_problems: ['One chapter left for two preparations.'],
            },
          })
        : base(prompt, system, options)
    ));
    const { warnings } = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(store.loadEndingReadiness()?.remaining_requirements).toEqual(['Someone must open the outer door.']);
    expect(warnings.join(' ')).toContain('One chapter left for two preparations.');
    expect(store.runLog().some(e => e.stage === 'ending')).toBe(true);
    // Chapter 2 is planned against what is left, not against the design's full list.
    await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    const planPrompt = vi.mocked(llm).mock.calls.map(([prompt]) => prompt)
      .filter(prompt => prompt.includes('Plan only the current chapter')).at(-1) || '';
    expect(planPrompt).toContain('Someone must open the outer door.');
  });

  it('retrieves the exact earlier paragraph a scene must return to', () => {
    const store = new MemoryProjectStore();
    // Paragraph ids come from paragraphsWithIds, which folds a very short opening into the next block.
    const prose = 'The upper room smelled of oil and older weather, and nobody had aired it since the spring.\n\nAren pocketed the brass key without a word, and the room did not object to the theft of its one lock.\n\nOutside, the sea kept its distance and made a show of not listening to any of it.';
    store.saveScene({
      id: 'CH01_S01', chapter: 1, prose, paragraph_ids: ['p1', 'p2', 'p3'], plan: null, delta: null,
    });
    const state = {
      ...emptyState(),
      events: [{ id: 'CH01_S01-e1', description: 'Aren takes the key.', participants: ['C01'], evidence_refs: ['p2'] }],
    };
    const byParagraph = resolveSourceRefs(['CH01_S01#p2'], store, state);
    expect(byParagraph.excerpts).toEqual(['[CH01_S01#p2] Aren pocketed the brass key without a word, and the room did not object to the theft of its one lock.']);
    expect(byParagraph.missing).toEqual([]);
    // A recorded event resolves through its own evidence to the same paragraph.
    expect(resolveSourceRefs(['CH01_S01-e1'], store, state).excerpts).toEqual(byParagraph.excerpts);
  });

  it('reports a callback reference that no written paragraph answers', () => {
    const store = new MemoryProjectStore();
    store.saveScene({ id: 'CH01_S01', chapter: 1, prose: 'One paragraph only.', paragraph_ids: ['p1'], plan: null, delta: null });
    const resolved = resolveSourceRefs(['CH01_S01#p9', 'the bit about the lamp', 'CH07_S01#p1'], store, emptyState());
    expect(resolved.excerpts).toEqual([]);
    expect(resolved.missing).toEqual(['CH01_S01#p9', 'the bit about the lamp', 'CH07_S01#p1']);
  });

  it('hands the writer the cited paragraph and tells it not to lean on a citation nothing answers', async () => {
    const store = new MemoryProjectStore();
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm());
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt, system, options) => {
      if (prompt.includes('Plan only the current chapter') && !prompt.includes('Chapter:\n1 of')) {
        const chapterPlan = plan(2);
        chapterPlan.scenes[0].required_source_refs = ['CH01_S01#p1', 'CH01_S01#p9'];
        return JSON.stringify(chapterPlan);
      }
      return base(prompt, system, options);
    });
    await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    const first = paragraphsWithIds(store.chapterScenes(1)[0].prose)[0].text;
    const writePrompt = vi.mocked(llm).mock.calls.map(([prompt]) => prompt)
      .find(prompt => prompt.includes('Write a full literary scene') && prompt.includes('CH01_S01#p1')) || '';
    expect(writePrompt).toContain(first.slice(0, 40));
    expect(store.runLog().some(e => e.stage === 'retrieval')).toBe(true);
    expect(writePrompt).toContain('cites earlier text that cannot be retrieved: CH01_S01#p9');
    expect(writePrompt).toContain('Write the scene without leaning on that earlier passage');
  });

  it('names a third scene running in the same staging and leaves two alone', () => {
    const staged = (id: string, participants: string[], location: string) =>
      ({ ...plan(1).scenes[0], id, participants, location });
    const shape = (id: string, participants: string[], location: string) => sceneShape(staged(id, participants, location));
    const twice = [shape('CH01_S01', ['C01', 'C02'], 'The upper room'), shape('CH01_S02', ['C01', 'C02'], 'the upper room ')];
    // Two in a row is a conversation continuing; the third is the pattern.
    expect(repeatedStaging(shape('CH01_S02', ['C01', 'C02'], 'The upper room'), twice.slice(0, 1))).toBe('');
    expect(repeatedStaging(shape('CH01_S03', ['C01', 'C02'], 'The upper room'), twice))
      .toMatch(/keeps the staging of the 2 scenes before it/);
    // Order of participants is not a difference; a different room is.
    expect(repeatedStaging(shape('CH01_S03', ['C02', 'C01'], 'The upper room'), twice)).not.toBe('');
    expect(repeatedStaging(shape('CH01_S03', ['C01', 'C02'], 'The outer door'), twice)).toBe('');
    // And it reaches the readiness gate as a named doubt, not as a silent note.
    const problems = checkReadiness(design(), emptyState(), staged('CH01_S03', ['C01', 'C02'], 'The upper room'), [], twice);
    expect(problems.map(item => item.code)).toContain('repeated-staging');
  });

  it('flags a staging that owns half the window even when it is not consecutive', () => {
    const shape = (id: string, participants: string[], location: string) =>
      sceneShape({ ...plan(1).scenes[0], id, participants, location });
    const recent = [
      shape('CH01_S01', ['C01', 'C02'], 'The upper room'),
      shape('CH01_S02', ['C01'], 'The stair'),
      shape('CH01_S03', ['C01', 'C02'], 'The upper room'),
      shape('CH01_S04', ['C02'], 'The outer door'),
      shape('CH02_S01', ['C01', 'C02'], 'The upper room'),
      shape('CH02_S02', ['C01'], 'The stair'),
    ];
    expect(repeatedStaging(shape('CH02_S03', ['C01', 'C02'], 'The upper room'), recent))
      .toMatch(/repeats a staging already used 3 times/);
  });

  it('gives the chapter planner the stagings of the accepted scenes', async () => {
    const store = new MemoryProjectStore();
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm());
    const shapes = recentShapes(store, 1);
    expect(shapes).toHaveLength(1);
    expect(describeShapes(shapes)).toContain('CH01_S01');
    const llm = fullLlm();
    await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    const planPrompt = vi.mocked(llm).mock.calls.map(([prompt]) => prompt)
      .find(prompt => prompt.includes('Plan only the current chapter')) || '';
    expect(planPrompt).toContain('Stagings of the recently accepted scenes');
    expect(planPrompt).toContain(describeShapes(shapes.slice(0, 1)).split('\n')[0]);
  });

  it('moves a bond on a deed and refuses to move it on a declaration', () => {
    const rescue = {
      ...delta(),
      state_changes: [{ entity_id: 'C01->C02', field: 'trust', before: 'wary', after: 'trusts him in the water', evidence_refs: ['p2'] }],
    };
    const moved = applyDelta(emptyState(), rescue, 'CH01_S01');
    expect(moved.state.conditions['C01->C02.trust']).toBe('trusts him in the water');
    expect(moved.refused).toEqual([]);
    // The same change with no deed and nothing learned in the scene: words, not a bond.
    const talk = { ...rescue, events: [], knowledge_changes: [] };
    const declared = applyDelta(emptyState(), talk, 'CH01_S01');
    expect(declared.state.conditions['C01->C02.trust']).toBeUndefined();
    expect(declared.refused.join(' ')).toMatch(/no deed and nothing learned/);
    // And with a deed but no citation, it is still refused.
    const uncited = { ...rescue, state_changes: [{ ...rescue.state_changes[0], evidence_refs: [] }] };
    expect(applyDelta(emptyState(), uncited, 'CH01_S01').refused.join(' ')).toMatch(/cites no paragraph/);
  });

  it('shows the writer where the participants stand now, not where they started', async () => {
    const state = { ...emptyState(), conditions: { 'C01->C02.trust': 'in his debt since the water', 'Corin->C04.trust': 'unchanged' } };
    const relations = relationsFor(state, ['C01', 'C02']);
    expect(relations).toHaveLength(1);
    expect(parseRelation('C01->C02.trust', 'x')).toMatchObject({ from: 'C01', to: 'C02', kind: 'trust' });
    expect(describeRelations(relations)).toBe('C01 → C02 (trust): in his debt since the water');
    const ctx = buildSceneContext(design(), state, plan(1).scenes[0], '', [], [], null, []);
    expect(ctx.vars.participant_relationships).toContain('in his debt since the water');
    expect(ctx.vars.participant_relationships).not.toContain('unchanged');
  });

  it('warns the chapter when memory declines a relationship change', async () => {
    const store = new MemoryProjectStore();
    const declared = () => ({
      ...delta(),
      events: [],
      knowledge_changes: [],
      state_changes: [{ entity_id: 'C01->C02', field: 'trust', before: 'wary', after: 'devoted', evidence_refs: ['p1'] }],
    });
    const { warnings } = await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm(declared));
    expect(warnings.join(' ')).toMatch(/"C01->C02.trust" was not moved to "devoted"/);
    expect(store.loadState().conditions['C01->C02.trust']).toBeUndefined();
    expect(store.runLog().some(e => e.stage === 'memory')).toBe(true);
  });

  it('keeps entity-qualified condition keys from doubling', () => {
    const moved = { ...delta(), state_changes: [{ entity_id: 'C01.location', field: 'location', before: null, after: 'Upper room', evidence_refs: ['p1'] }] };
    const state = applyDelta(emptyState(), moved, 'CH01_S01').state;
    expect(state.conditions['C01.location']).toBe('Upper room');
    expect(state.conditions['C01.location.location']).toBeUndefined();
  });

  it('resolves threads cited in words and never pays the same thread twice', () => {
    const threads = [{ id: 'CH01_S01-t1', description: 'Will Aren find the door?', status: 'open' as const, setup_refs: ['CH01_S01'], payoff_refs: [] as string[] }];
    const payoff = { ...delta(), threads_resolved: [{ thread: 'Will Aren find the door?' }] };
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
    const blocked = { ...delta(), contradictions: [{ description: 'Aren was elsewhere.', prior_refs: [], scene_refs: ['p1'], blocks_continuation: true }] };
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

  it('keeps the rewritten scene and reports it when the rewrite does not clear the objection', async () => {
    const store = new MemoryProjectStore();
    const blocked = { ...delta(), contradictions: [{ description: 'Aren was elsewhere.', prior_refs: [], scene_refs: ['p1'], blocks_continuation: true }] };
    const llm = fullLlm(() => blocked);
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(store.manuscript()).toHaveLength(1);
    expect(outcome.warnings.join(' ')).toMatch(/still breaks continuity after its rewrite and was kept: Aren was elsewhere/);
    expect(vi.mocked(llm).mock.calls.filter(([prompt]) => prompt.includes('Write a full literary scene'))).toHaveLength(2);
    expect(store.runLog().some(entry => entry.stage === 'continuity')).toBe(true);
  });

  it('cuts down in place the paragraph that stages a beat the book already has, and writes nothing again', async () => {
    const store = new MemoryProjectStore();
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm());
    const long = 'Aren came up the last turn of the stair and into the upper room as though for the first time, the hot glass and the rain meeting her exactly as they had before, and she stood in it and took it all in again from the beginning.';
    const restaged = {
      ...delta(),
      events: [
        { description: 'Aren reaches the upper room.', participants: ['C01'], evidence_refs: ['p1'] },
        { description: 'Aren finds the outer door open.', participants: ['C01'], evidence_refs: ['p2'] },
      ],
      restaged_beats: [{ beat: 'Aren reaches the upper room for the first time', earlier_ref: 'CH01_S01-e1', evidence_refs: ['p1'] }],
    };
    const base = fullLlm(() => restaged);
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Write a full literary scene')) return `${long}\n\nBelow the gallery the outer door stood open on nothing at all.`;
      if (prompt.includes('Rewrite the listed paragraphs so they no longer stage')) {
        expect(prompt).toContain('already on record as CH01_S01-e1');
        return JSON.stringify({ replacements: [{ paragraph: 'p1', replacement: 'Aren was back in the upper room.' }] });
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    const calls = vi.mocked(llm).mock.calls.map(([prompt]) => prompt);
    expect(calls.filter(prompt => prompt.includes('Write a full literary scene'))).toHaveLength(1);
    expect(calls.filter(prompt => prompt.includes('Extract the essential changes from the new scene'))).toHaveLength(1);
    expect(store.manuscript()[1].text).toBe('Aren was back in the upper room.\n\nBelow the gallery the outer door stood open on nothing at all.');
    // The event that paragraph was the only evidence for is not recorded twice.
    expect(store.loadState().events.map(event => event.description)).toEqual(['Aren reaches the upper room.', 'Aren finds the outer door open.']);
    expect(outcome.warnings.join(' ')).toMatch(/1 paragraph\(s\) that staged again what the book already had were cut down in place/);
  });

  it('keeps a paragraph whose rewrite is not clearly shorter, and says so', async () => {
    const store = new MemoryProjectStore();
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm());
    const restaged = { ...delta(), restaged_beats: [{ beat: 'Aren reaches the upper room again', earlier_ref: 'CH01_S01-e1', evidence_refs: ['p1'] }] };
    const base = fullLlm(() => restaged);
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Rewrite the listed paragraphs so they no longer stage')) {
        return JSON.stringify({ replacements: [{ paragraph: 'p1', replacement: 'The upper room smelled of hot glass and of the rain again.' }] });
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    expect(outcome.warnings.join(' ')).toMatch(/p1 was kept: the rewrite was not clearly shorter/);
  });

  it('does not rewrite a scene over a repetition charge that names nothing on record', async () => {
    const store = new MemoryProjectStore();
    const vague = { ...delta(), restaged_beats: [{ beat: 'They argue again', earlier_ref: 'somewhere earlier', evidence_refs: ['p1'] }] };
    const llm = fullLlm(() => vague);
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    expect(vi.mocked(llm).mock.calls.filter(([prompt]) => prompt.includes('Write a full literary scene'))).toHaveLength(1);
    expect(outcome.warnings.join(' ')).toMatch(/names no recorded event or fact \(somewhere earlier\)/);
  });

  it('reads a list the extraction left out as empty instead of ending the book over it', async () => {
    const store = new MemoryProjectStore();
    const { knowledge_changes: _dropped, plan_deviations: _alsoDropped, ...partial } = delta();
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm(() => partial));
    expect(store.manuscript()).toHaveLength(1);
    expect(store.loadState().events).toHaveLength(1);
    expect(outcome.warnings).toEqual([]);
    expect(store.runLog().some(entry => entry.stage === 'memory' && /left out knowledge_changes, plan_deviations, restaged_beats, established_facts; read as empty/.test(entry.detail))).toBe(true);
  });

  it('folds a disclosure the editor wrapped in an object as the sentence it carries, once', async () => {
    const store = new MemoryProjectStore();
    const wrapped = () => ({ ...delta(), reader_disclosures: [{ disclosure: 'The ledger was rewritten.', evidence_refs: ['p1'] }] });
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm(wrapped));
    await new ChapterPipelineV2().writeChapter(design(), 2, store, fullLlm(wrapped));
    expect(store.loadState().reader_disclosures).toEqual(['The ledger was rewritten.']);
    const handoff = store.chapterScenes(2)[0].handoff!;
    expect(handoff.known_to_reader).toContain('The ledger was rewritten.');
    expect(JSON.stringify(handoff)).not.toContain('evidence_refs');
  });

  it('still refuses an extraction with no events list, or with a list that is not one', async () => {
    const { events: _events, ...eventless } = delta();
    await expect(new ChapterPipelineV2().writeChapter(design(), 1, new MemoryProjectStore(), fullLlm(() => eventless)))
      .rejects.toThrow(/validator call failed/);
    const malformed = { ...delta(), knowledge_changes: 'none' };
    await expect(new ChapterPipelineV2().writeChapter(design(), 1, new MemoryProjectStore(), fullLlm(() => malformed)))
      .rejects.toThrow(/"knowledge_changes" as something other than a list/);
  });

  it('finishes the chapter when the reconciliation fails after it', async () => {
    const failing = (): NovelLLM => {
      const base = fullLlm();
      return vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Refine the forward plan')) return 'not json';
        return (base as NovelLLM)(prompt, system, options);
      });
    };
    const store = new MemoryProjectStore();
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, failing());
    expect(store.manuscript()).toHaveLength(1);
    expect(outcome.warnings.join(' ')).toMatch(/plan ahead was not reconciled with chapter 1/);
  });

  it('tells the writer not to stage again what a finished chapter already staged, before any prose exists', async () => {
    const store = new MemoryProjectStore();
    store.saveManuscript(1, 'The upper room held its light over the stairs. Aren watched.');
    const echoPlan = {
      ...plan(2),
      scenes: [{
        ...plan(2).scenes[0],
        location: 'Upper room',
        function: 'An uneasy night together.',
        development: 'The upper room held its light while they waited.',
        required_outcome: 'They wait by the lamp.',
      }],
    };
    const base = fullLlm();
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Plan only the current chapter')) return JSON.stringify(echoPlan);
      return (base as NovelLLM)(prompt, system, options);
    });
    await new ChapterPipelineV2().writeChapter(design(), 2, store, llm);
    const prompts = vi.mocked(llm).mock.calls.map(([prompt]) => prompt);
    expect(prompts.some(prompt => prompt.includes('Code-level doubts'))).toBe(false);
    const written = prompts.find(prompt => prompt.includes('Write a full literary scene'))!;
    expect(written).toContain('shares distinctive phrasing with Chapter 1');
    expect(written).toContain('Do not stage that passage again.');
    expect(store.manuscript()).toHaveLength(2);
    expect(store.manuscript().find(item => item.chapter === 2)?.text).toContain('the outer door stood open');
  });

  it('has the editor read the strongest of a scene\'s plan-against-memory clashes, once for the chapter, and no more', async () => {
    const store = new MemoryProjectStore();
    const clashes = Array.from({ length: 12 }, (_, index) => ({
      code: 'clash-suspect' as const,
      detail: `Plan states claim ${index + 1} but confirmed state holds otherwise (contradiction 0.${String(99 - index).padStart(2, '0')}). Reconcile before writing.`,
    }));
    const stubGate = async () => ({ problems: new Map([['CH01_S01', clashes]]), warnings: [] as string[], mode: 'full' as const });
    const base = fullLlm();
    const reviews: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (prompt.includes('Code-level doubts')) {
        reviews.push(prompt);
        return JSON.stringify({ ready: false, issues: [{ id: 'I01', severity: 'major', target_ref: 'CH01_S01', category: 'continuity', problem: 'Lamp state clash', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'Show the lamp dark on the page', suggested_adjustment: 's' }] });
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm, stubGate);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toContain('Plan states claim 1 but');
    expect(reviews[0]).toContain('Plan states claim 4 but');
    expect(reviews[0]).not.toContain('Plan states claim 5 but');
    const written = vi.mocked(llm).mock.calls.map(([prompt]) => prompt).find(prompt => prompt.includes('Write a full literary scene'))!;
    // The editor's verdict reaches the writer; the head's raw suspicions do not.
    expect(written).toContain('Show the lamp dark on the page');
    expect(written).not.toContain('Plan states claim');
    expect(outcome.warnings.join(' ')).toMatch(/Show the lamp dark/);
    expect(store.manuscript()).toHaveLength(1);
  });

  describe('the doubts only a reader can settle, read once for the chapter', () => {
    const strangers = () => {
      const planned = plan(1);
      const second = { ...planned.scenes[0], id: 'CH01_S02', location: 'Gallery', function: 'The keeper is questioned', required_outcome: 'Aren learns who lit the lamp.', outcome_kind: 'knowledge', participants: ['C01', 'The inspector'] };
      return { ...planned, scenes: [{ ...planned.scenes[0], participants: ['C01', 'Antagonist'] }, second] };
    };
    const staged = (review: () => string) => {
      const base = fullLlm();
      const reviews: string[] = [];
      const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Plan only the current chapter')) return JSON.stringify(strangers());
        if (prompt.includes('Check whether the provided plan is ready') && prompt.includes('readiness')) { reviews.push(prompt); return review(); }
        return (base as NovelLLM)(prompt, system, options);
      });
      return { llm, reviews };
    };

    it('asks about every such scene of the chapter in one review and gives each writer its own verdict', async () => {
      const store = new MemoryProjectStore();
      const { llm, reviews } = staged(() => JSON.stringify({ ready: false, issues: [
        { id: 'I01', severity: 'major', target_ref: 'CH01_S01', category: 'cast', problem: 'p', evidence_refs: [], consequence_for_writing: 'c', required_decision: 'Keep the antagonist offstage and unnamed.', suggested_adjustment: 's' },
        { id: 'I02', severity: 'major', target_ref: 'CH01_S02', category: 'cast', problem: 'p', evidence_refs: [], consequence_for_writing: 'c', required_decision: 'The inspector is heard through the door only.', suggested_adjustment: 's' },
      ] }));
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toContain('- CH01_S01 unknown-participant:');
      expect(reviews[0]).toContain('- CH01_S02 unknown-participant:');
      const writes = vi.mocked(llm).mock.calls.map(([prompt]) => prompt).filter(prompt => prompt.includes('Write a full literary scene'));
      expect(writes[0]).toContain('Keep the antagonist offstage and unnamed.');
      expect(writes[0]).not.toContain('The inspector is heard through the door only.');
      expect(writes[1]).toContain('The inspector is heard through the door only.');
      expect(outcome.warnings.join(' ')).toMatch(/Scene CH01_S02 must establish: The inspector is heard through the door only\./);
    });

    it('reads the scenes one at a time when the chapter review cannot be had, and writes them when that fails too', async () => {
      const store = new MemoryProjectStore();
      const { llm, reviews } = staged(() => 'not json');
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      // One for the chapter, then one for each of the two scenes; each asked twice by the retry.
      expect(new Set(reviews.map(prompt => prompt.slice(0, prompt.indexOf('Code-level doubts')))).size).toBe(3);
      expect(store.manuscript()).toHaveLength(1);
      expect(outcome.warnings.join(' ')).toMatch(/CH01_S01 was written without its readiness review .*Unanswered doubts: unknown-participant/);
    });
  });

  it('keeps the particulars a scene fixes on the shelf that travels whole, ten a scene and none twice', async () => {
    const store = new MemoryProjectStore();
    const facts = Array.from({ length: 14 }, (_, index) => ({ statement: `The ledger shows ${index + 1} entries.`, evidence_refs: ['p1'] }));
    const stating = () => ({ ...delta(), established_facts: [...facts, { statement: 'the ledger shows 1 entries', evidence_refs: ['p1'] }] });
    await new ChapterPipelineV2().writeChapter(design(), 1, store, fullLlm(stating));
    // The design's own particulars are on the shelf first, before any scene.
    const ids = store.loadState().facts.map(fact => fact.id);
    expect(ids.slice(0, 8)).toEqual(['DESIGN-R01', 'DESIGN-R02', 'DESIGN-R03', 'DESIGN-R04', 'DESIGN-R05', 'DESIGN-R06', 'DESIGN-R07', 'DESIGN-R08']);
    expect(ids.slice(8)).toEqual(Array.from({ length: 10 }, (_, index) => `CH01_S01-f${index + 1}`));
    expect(store.loadState().facts[0]).toMatchObject({ subject: 'the tower', attribute: 'floors' });
    await new ChapterPipelineV2().writeChapter(design(), 2, store, fullLlm(stating));
    expect(store.loadState().facts).toHaveLength(18);
  });

  it('shows the reconciliation what the chapter itself recorded and where it left its plan', async () => {
    const store = new MemoryProjectStore();
    const deviating = () => ({ ...delta(), plan_deviations: [{ planned: 'One guest was erased.', actual: 'Three guests were erased.', future_dependency_affected: 'the ending' }] });
    const llm = fullLlm(deviating);
    await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
    const prompts = vi.mocked(llm).mock.calls.map(([prompt]) => prompt);
    const forwardPrompt = prompts.find(prompt => prompt.includes('Refine the forward plan'))!;
    expect(forwardPrompt).toContain('CH01_S01: planned "One guest was erased.", written "Three guests were erased." — affects the ending');
    expect(forwardPrompt).toContain('CH01_S01: Aren reaches the upper room.');
  });

  it('enters what the premise gave as promises before the first scene, people excepted, and never twice', async () => {
    const store = new MemoryProjectStore();
    const given = design();
    given.contract.premise_givens = [
      { given: 'Aren', kind: 'person' },
      { given: 'a door in the sea', kind: 'thing' },
      { given: 'the only keeper left on the rock', kind: 'fact' },
    ];
    await new ChapterPipelineV2().writeChapter(given, 1, store, fullLlm());
    await new ChapterPipelineV2().writeChapter(given, 1, store, fullLlm());
    const premise = store.loadThreads().filter(thread => thread.id.startsWith('PREMISE-'));
    expect(premise.map(thread => thread.description)).toEqual(['a door in the sea', 'the only keeper left on the rock']);
    expect(premise.every(thread => thread.status === 'open')).toBe(true);
    // Aged from chapter one, so the plan gate can see one that is being dropped.
    expect(openThreadsWithAge(store).filter(item => item.thread.id.startsWith('PREMISE-')).map(item => item.madeInChapter)).toEqual([1, 1]);
  });

  it('says where a run sent its calls and its characters, stage by stage', async () => {
    const store = new MemoryProjectStore();
    const result = await new Orchestrator(store, { maxCalls: 200, maxTimeMs: 60000 }, new ChapterPipelineV2()).runBook(input, fullLlm());
    const stages = new Map((result.usage || []).map(item => [item.stage, item]));
    expect([...stages.keys()]).toEqual(expect.arrayContaining(['audit', 'chapter-plan', 'design', 'design-review', 'forward', 'scene-write', 'track']));
    expect(stages.has('unlabelled')).toBe(false);
    expect(stages.has('scene-rebase')).toBe(false);
    expect(stages.get('scene-write')?.calls).toBe(2);
    expect(stages.get('track')!.sent).toBeGreaterThan(stages.get('track')!.received);
    const lines = store.runLog().filter(entry => entry.stage === 'usage').map(entry => entry.detail);
    expect(lines.at(-1)).toMatch(/^total: \d+ call\(s\), sent \d+ \(\d+\.\dx the manuscript\), received \d+/);
  });

  it('shows the writer where things stand for the people in the scene, not the whole record', () => {
    const handoff = {
      after_scene_id: 'CH01_S01', known_to_reader: ['a', 'b'], confirmed_changes: ['c'],
      current_conditions: { 'C01.location': 'gallery', 'C09.location': 'harbour', 'lamp.state': 'dark', 'C09->C01.trust': 'broken', 'C01->C09.debt': 'owed' },
      open_questions: Array.from({ length: 12 }, (_, index) => `Q${index + 1}`), active_intentions: [], previous_outcome: 'o',
      required_new_outcome: 'n', forbidden_restatements: Array.from({ length: 20 }, (_, index) => `R${index + 1}`),
    };
    const view = writerHandoff(handoff, ['C01'], ['C01', 'C09']) as Record<string, any>;
    expect(Object.keys(view.current_conditions)).toEqual(['C01.location', 'lamp.state', 'C09->C01.trust', 'C01->C09.debt']);
    expect(view.open_questions).toHaveLength(8);
    expect(view.already_told_do_not_explain_again).toHaveLength(12);
    expect(view.already_told_do_not_explain_again.at(-1)).toBe('R20');
    expect(view.known_to_reader).toBeUndefined();
    expect(view.confirmed_changes).toBeUndefined();
    expect(Object.keys(plannerHandoff(handoff))).not.toContain('known_to_reader');
  });

  describe('a scene replanned only when the one before it left its plan', () => {
    const solitaryDesign = () => {
      const d = design();
      d.profile.dialogue_weight = 'low';
      return d;
    };
    const two = () => {
      const planned = plan(1);
      const second = { ...planned.scenes[0], id: 'CH01_S02', location: 'Gallery', function: 'Aren deals with the outer door', required_outcome: 'Aren opens the outer door and looks out.', outcome_kind: 'knowledge' };
      return { ...planned, scenes: [planned.scenes[0], second] };
    };
    const staged = (first: () => unknown, replan?: () => unknown) => {
      const base = fullLlm();
      let tracked = 0;
      const replans: string[] = [];
      const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Plan only the current chapter')) return JSON.stringify(two());
        if (prompt.includes('Extract the essential changes from the new scene')) return JSON.stringify(tracked++ === 0 ? first() : delta());
        if (prompt.includes('Update the next scene plan against the explicit handoff')) {
          replans.push(prompt);
          if (replan) return JSON.stringify(replan());
        }
        return (base as NovelLLM)(prompt, system, options);
      });
      return { llm, replans };
    };

    it('writes the next scene as planned when the scene before it kept to its plan', async () => {
      const store = new MemoryProjectStore();
      const { llm, replans } = staged(delta);
      await new ChapterPipelineV2().writeChapter(solitaryDesign(), 1, store, llm);
      expect(replans).toEqual([]);
      expect(store.chapterScenes(1)).toHaveLength(2);
    });

    it('does not replan for a detail the scene supplied or a departure the next scene can live with', async () => {
      const store = new MemoryProjectStore();
      const { llm, replans } = staged(() => ({ ...delta(), plan_deviations: [
        { planned: 'Aren finds the log.', actual: 'Aren finds four logs, the top one dated 3 January.', future_dependency_affected: 'the date is now fixed', next_scene_must_change: false },
        { planned: 'Aren is told about the door.', actual: 'Aren works it out herself.', future_dependency_affected: 'later chapters' },
      ] }));
      await new ChapterPipelineV2().writeChapter(solitaryDesign(), 1, store, llm);
      expect(replans).toEqual([]);
      expect(store.chapterScenes(1)).toHaveLength(2);
    });

    it('replans the next scene, with the reason, when the scene before it departed from its plan', async () => {
      const store = new MemoryProjectStore();
      const { llm, replans } = staged(() => ({ ...delta(), plan_deviations: [{ planned: 'Aren stops at the upper room.', actual: 'Aren already opened the outer door.', future_dependency_affected: 'the next scene', next_scene_must_change: true }] }));
      await new ChapterPipelineV2().writeChapter(solitaryDesign(), 1, store, llm);
      expect(replans).toHaveLength(1);
      expect(replans[0]).toContain('was planned as "Aren stops at the upper room." and was written as "Aren already opened the outer door.", which affects the next scene.');
      expect(replans[0]).not.toContain('Confirmed state:');
      expect(store.runLog().some(entry => entry.stage === 'scene-rebase' && /replanned after CH01_S01: 1 departure/.test(entry.detail))).toBe(true);
    });

    it('writes the planned scene when the replan will not validate', async () => {
      const store = new MemoryProjectStore();
      const { llm } = staged(
        () => ({ ...delta(), plan_deviations: [{ planned: 'p', actual: 'a', future_dependency_affected: '', next_scene_must_change: true }] }),
        () => ({ nothing: 'usable' }),
      );
      const { warnings } = await new ChapterPipelineV2().writeChapter(solitaryDesign(), 1, store, llm);
      expect(store.chapterScenes(1)).toHaveLength(2);
      expect(warnings.join(' ')).toMatch(/kept its planned causal chain/);
      expect(store.runLog().some(e => e.stage === 'scene-rebase' && /rebase failed/.test(e.detail))).toBe(true);
    });
  });

  describe('the chapter check, while nothing after the chapter exists', () => {
    const WRONG = 'Aren climbed while the storm took the rail from her hands.';
    const RIGHT = 'Aren climbed while the storm took the lamp from her hands.';
    const checking = (overrides: { check: unknown; extraction?: (prompt: string) => unknown; correction?: unknown; beat?: string }) => {
      const base = fullLlm();
      const seen: string[] = [];
      const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Refine the forward plan')) {
          seen.push('check');
          return typeof overrides.check === 'string' ? overrides.check : JSON.stringify({ ...forward(), ...(overrides.check as object) });
        }
        if (prompt.includes('Rewrite the listed sentences so each states what the book holds')) { seen.push('correct'); return JSON.stringify(overrides.correction); }
        if (prompt.includes('Write the short passage that goes between the two paragraphs')) { seen.push('insert'); return overrides.beat || ''; }
        if (overrides.extraction && prompt.includes('Extract the essential changes from the new scene')) {
          return JSON.stringify(overrides.extraction(prompt));
        }
        return (base as NovelLLM)(prompt, system, options);
      });
      return { llm, seen };
    };
    const align = { repairs: [{ id: 'R1', kind: 'align', problem: 'The rail is said to be lost; the book holds that the lamp was.', scene_id: 'CH01_S01', canonical: 'The storm took the lamp, not the rail.', quotes: [WRONG] }], leave_to_later: [] };

    it('corrects a sentence in place, reads the scene into memory again, and keeps the original beside it', async () => {
      const store = new MemoryProjectStore();
      const { llm, seen } = checking({
        check: align,
        correction: { replacements: [{ original: WRONG, replacement: RIGHT, refused_because: '' }] },
        extraction: prompt => (prompt.includes('took the lamp')
          ? { ...delta(), events: [{ description: 'The storm takes the lamp from Aren.', participants: ['C01'], evidence_refs: ['p1'] }] }
          : delta()),
      });
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(seen).toEqual(['check', 'correct']);
      expect(store.manuscript()[0].text).toContain(RIGHT);
      expect(store.manuscript()[0].text).not.toContain(WRONG);
      const scene = store.chapterScenes(1)[0];
      expect(scene.original_prose).toContain(WRONG);
      // Memory holds what the corrected scene says, once — not both versions.
      expect(store.loadState().events.map(event => event.description)).toEqual(['The storm takes the lamp from Aren.']);
      expect(scene.handoff?.known_to_reader).toContain('The storm takes the lamp from Aren.');
      expect(outcome.warnings.join(' ')).toMatch(/check corrected CH01_S01: 1 sentence\(s\) corrected/);
      expect(store.checkpoints()).toContain('chapter-check-1');
    });

    it('does not read the scene again when the corrected sentence is one no record cites', async () => {
      const store = new MemoryProjectStore();
      const SMELL = 'The upper room smelled of hot glass and rain.';
      const { llm, seen } = checking({
        check: { repairs: [{ id: 'R1', kind: 'align', problem: 'The room smells of oil in every other scene.', scene_id: 'CH01_S01', canonical: 'The upper room smells of lamp oil.', quotes: [SMELL] }] },
        correction: { replacements: [{ original: SMELL, replacement: 'The upper room smelled of lamp oil and rain.' }] },
      });
      await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(seen).toEqual(['check', 'correct']);
      // The fixture's one event cites p1; the correction was in p2.
      expect(vi.mocked(llm).mock.calls.filter(([prompt]) => prompt.includes('Extract the essential changes from the new scene'))).toHaveLength(1);
      expect(store.manuscript()[0].text).toContain('lamp oil and rain');
      expect(store.chapterScenes(1)[0].original_prose).toContain(SMELL);
      expect(store.loadState().events).toHaveLength(1);
    });

    it('makes no correction on a quotation the scene does not contain', async () => {
      const store = new MemoryProjectStore();
      const { llm, seen } = checking({ check: { repairs: [{ ...align.repairs[0], quotes: ['Aren climbed while the storm tore the rail away.'] }] } });
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(seen).toEqual(['check']);
      expect(store.manuscript()[0].text).toContain(WRONG);
      expect(outcome.warnings.join(' ')).toMatch(/quotes nothing CH01_S01 says word for word/);
    });

    it('takes a correction back out when memory refuses the corrected scene', async () => {
      const store = new MemoryProjectStore();
      const { llm } = checking({
        check: align,
        correction: { replacements: [{ original: WRONG, replacement: RIGHT, refused_because: '' }] },
        extraction: prompt => (prompt.includes('took the lamp')
          ? { ...delta(), contradictions: [{ description: 'The lamp was never carried up.', prior_refs: [], scene_refs: ['p1'], blocks_continuation: true }] }
          : delta()),
      });
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(store.manuscript()[0].text).toContain(WRONG);
      expect(store.chapterScenes(1)[0].original_prose).toBeUndefined();
      expect(store.loadState().events.map(event => event.description)).toEqual(['Aren reaches the upper room.']);
      expect(outcome.warnings.join(' ')).toMatch(/correction was taken back out — memory refused the corrected scene \(The lamp was never carried up\)/);
    });

    it('adds one short beat after the paragraph it names and moves nothing else', async () => {
      const store = new MemoryProjectStore();
      const beat = 'She counted the steps as she went, the way her mother had taught her.';
      const { llm, seen } = checking({
        check: { repairs: [{ id: 'R1', kind: 'insert', problem: 'The counting is used later and never shown.', scene_id: 'CH01_S01', after_paragraph: 'CH01_S01#p1', must_establish: 'Aren counts the steps.' }] },
        beat: `Here is the passage:\n\n${beat}`,
      });
      await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(seen).toEqual(['check', 'insert']);
      expect(store.manuscript()[0].text).toBe(`${WRONG}\n\n${beat}\n\nThe upper room smelled of hot glass and rain.`);
    });

    it('refuses a beat that came back the length of a scene', async () => {
      const store = new MemoryProjectStore();
      const { llm } = checking({
        check: { repairs: [{ id: 'R1', kind: 'insert', problem: 'p', scene_id: 'CH01_S01', after_paragraph: 'p1', must_establish: 'Aren counts the steps.' }] },
        beat: Array.from({ length: 400 }, () => 'step').join(' '),
      });
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(store.manuscript()[0].text).toBe(PROSE);
      expect(outcome.warnings.join(' ')).toMatch(/came back at 400 words against a limit of 150/);
    });

    it('lets the chapter stand when the check itself cannot be had', async () => {
      const store = new MemoryProjectStore();
      const { llm } = checking({ check: 'not json' });
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(store.manuscript()).toHaveLength(1);
      expect(outcome.warnings.join(' ')).toMatch(/plan ahead was not reconciled with chapter 1, and the chapter was not checked against the book's record/);
    });
  });

  describe('speech and images, measured rather than requested', () => {
    const two = () => {
      const cast = design();
      cast.characters = [...cast.characters, { ...cast.characters[0], id: 'C02', name: 'Bram' }];
      return cast;
    };
    const narrated = Array.from({ length: 40 }, (_, index) => `Aren crossed the gallery a ${index + 1}th time and Bram watched her do it.`).join(' ');
    const said = Array.from({ length: 40 }, (_, index) => `"You counted ${index + 1} steps," Bram said.`).join(' ');
    const staged = (drafts: string[]) => {
      const base = fullLlm();
      let writes = 0;
      const prompts: string[] = [];
      const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Plan only the current chapter')) {
          const planned = plan(1);
          planned.scenes[0].participants = ['C01', 'C02'];
          return JSON.stringify(planned);
        }
        if (prompt.includes('Write a full literary scene')) { prompts.push(prompt); return drafts[Math.min(writes++, drafts.length - 1)]; }
        return (base as NovelLLM)(prompt, system, options);
      });
      return { llm, prompts };
    };

    it('writes a two-person scene once more when it comes back narrated, with the number in the request', async () => {
      const store = new MemoryProjectStore();
      const { llm, prompts } = staged([narrated, said]);
      const outcome = await new ChapterPipelineV2().writeChapter(two(), 1, store, llm);
      expect(prompts).toHaveLength(2);
      expect(prompts[1]).toMatch(/gave 0\.0% of its words to speech with 2 people present/);
      expect(store.manuscript()[0].text).toContain('"You counted 1 steps," Bram said.');
      expect(outcome.warnings.join(' ')).not.toMatch(/asked for more speech/);
      expect(store.runLog().some(entry => entry.stage === 'texture' && /rewritten once, now/.test(entry.detail))).toBe(true);
    });

    it('asks once, keeps the better draft, and says so when the scene still will not speak', async () => {
      const store = new MemoryProjectStore();
      const { llm, prompts } = staged([narrated, narrated]);
      const outcome = await new ChapterPipelineV2().writeChapter(two(), 1, store, llm);
      expect(prompts).toHaveLength(2);
      expect(outcome.warnings.join(' ')).toMatch(/CH01_S01 was asked for more speech and still gives 0\.0%/);
    });

    it('leaves a scene with one person in it alone', async () => {
      const store = new MemoryProjectStore();
      const llm = fullLlm();
      await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      expect(vi.mocked(llm).mock.calls.filter(([prompt]) => prompt.includes('Write a full literary scene'))).toHaveLength(1);
    });

    it('counts an image the check names and rewrites the sentences past its allowance out of the chapter', async () => {
      const store = new MemoryProjectStore();
      const sea = [
        'The sea worked at the shingle below the lamp.',
        'Out there the tide dragged the stones of the sea back.',
        'She heard the sea knocking the shingle together.',
        'The sea took the stones and gave them back.',
        'Under it all the sea was at the shingle again.',
        'The sea went on with its stones.',
      ];
      const prose = `${sea.join(' ')}\n\nAren reached the upper room.`;
      const base = fullLlm();
      const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
        if (prompt.includes('Write a full literary scene')) return prose;
        if (prompt.includes('Refine the forward plan')) {
          return JSON.stringify({ ...forward(), repairs: [], worn_images: [{ image: 'the sea on the shingle', anchors: ['sea', 'shingle', 'stones'] }, { image: 'one word is a subject', anchors: ['sea'] }] });
        }
        if (prompt.includes('Rewrite the listed sentences') && prompt.includes('WORN IMAGE')) {
          expect(prompt).toContain('— rewrite without it) Under it all the sea was at the shingle again.');
          expect(prompt).not.toContain('The sea worked at the shingle below the lamp.');
          return JSON.stringify({ replacements: [
            { original: sea[4], replacement: 'Under it all the lamp ticked as it cooled.' },
            { original: sea[5], replacement: 'The sea kept at its stones.' },
          ] });
        }
        return (base as NovelLLM)(prompt, system, options);
      });
      const outcome = await new ChapterPipelineV2().writeChapter(design(), 1, store, llm);
      const text = store.manuscript()[0].text;
      expect(text).toContain('Under it all the lamp ticked as it cooled.');
      // A rewrite that still carries the image is not spliced: it is counted, not trusted.
      expect(text).toContain(sea[5]);
      expect(store.loadChapterPlan(1)?.worn_images).toEqual([{ image: 'the sea on the shingle', anchors: ['sea', 'shingle', 'stones'] }]);
      expect(outcome.warnings.join(' ')).toMatch(/"the sea on the shingle" stood at 6 use\(s\) against an allowance of 4; 1 sentence\(s\) in this chapter were rewritten without it and it now stands at 5/);
      expect(store.chapterScenes(1)[0].original_prose).toContain(sea[4]);
    });
  });

  it('plans the chapter with the editor\'s model, shares its length among the scenes, and carries an unpaid premise given to the chapter\'s close', async () => {
    const store = new MemoryProjectStore();
    const given = design();
    given.contract.premise_givens = [{ given: 'asks for the same room', kind: 'situation' }];
    const base = fullLlm();
    const routes: Record<string, string | undefined> = {};
    const llm: NovelLLM = vi.fn(async (prompt: string, system: string, options?: Parameters<NovelLLM>[2]) => {
      if (options?.stage) routes[options.stage] = options.route;
      if (prompt.includes('Plan only the current chapter')) {
        const planned = plan(1);
        Object.assign(planned.scenes[0], { target_words: 5000, pays_premise: [{ id: 'PREMISE-t1', action: 'He names the room before she offers one.' }], establishes: ['The upper room is on the third landing.'] });
        return JSON.stringify(planned);
      }
      return (base as NovelLLM)(prompt, system, options);
    });
    await new ChapterPipelineV2().writeChapter(given, 1, store, llm);
    expect(routes['chapter-plan']).toBe('validator');
    expect(routes['scene-write']).toBe('writer');
    const prompts = vi.mocked(llm).mock.calls.map(([prompt]) => prompt);
    const planPrompt = prompts.find(prompt => prompt.includes('Plan only the current chapter'))!;
    expect(planPrompt).toContain('PREMISE-t1 — asks for the same room');
    expect(planPrompt).toContain('room for 2 scenes');
    // One scene planned in a chapter of 2000 words: the scene gets the chapter, not the planner's number.
    expect(store.chapterScenes(1)[0].plan?.target_words).toBe(2000);
    const written = prompts.find(prompt => prompt.includes('Write a full literary scene'))!;
    expect(written).toContain('Owed from the premise, to be put on the page here: He names the room before she offers one.');
    expect(written).toContain('  - The upper room is on the third landing.');
    const closing = prompts.find(prompt => prompt.includes('Refine the forward plan'))!;
    expect(closing).toContain('CH01_S01: planned to put the premise given "asks for the same room" on the page by "He names the room before she offers one.", and the tracker did not find it done');
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
