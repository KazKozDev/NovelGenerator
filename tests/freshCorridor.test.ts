import { describe, it, expect, vi } from 'vitest';
import { FRESH_BANK, describeFreshPalette, freshCard, freshConstraint, freshPalette } from '../utils/novel/v2/fresh';
import { buildSceneContext, checkReadiness, planChapter, retellingSuspect, sceneBrief, voiceBrief } from '../utils/novel/v2/planner';
import { checkChapterPlan, thinScenePlan } from '../utils/novel/v2/planGate';
import { emptyState } from '../utils/novel/v2/store';
import { promptVariables, renderPrompt } from '../utils/novel/prompts';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { BookDesign, ChapterPlan, ScenePlan } from '../utils/novel/v2/types';

function design(): BookDesign {
  return {
    contract: { working_title: 'A Working Title', explicit_requirements: [], inferred_decisions: [], tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    profile: {
      pressure_curve: 'rising' as const,
      curve_reason: 'the sea closes in',
      declared_motifs: [],
      cost_kinds: ['a light that goes out'],
      dialogue_weight: 'medium' as const,
      staging_variety: 'medium' as const,
      mechanism_reuse: 'medium' as const,
      open_ending: false,
      mechanism_ledger: ['climb', 'open', 'wait', 'read'],
      ending_invariants: [],
    },
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'close third', attention: 'hands and weather', register: 'plain', humor: 'dry', emotional_expression: 'spare' },
    characters: [{ id: 'C01', name: 'Aren', story_function: 'keeper', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] }],
    world_rules: [],
    causal_map: [],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: [1, 2].map(n => ({
      chapter: n, function: 'f', main_change: 'm', event_ids: [], dependencies: [], setup_or_payoff: [], pov_id: 'C01', target_words: 2000,
      mechanism: n === 1 ? 'climb' : 'open', cost: 'the light goes out', pressure_rung: n,
    })),
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
    ...overrides,
  };
}

function rawPlan(scenes: ScenePlan[]): ChapterPlan {
  return {
    status: 'ready',
    chapter: 1,
    function: 'f',
    starting_situation: 's',
    ending_change: 'Aren finds the door.',
    mechanism: 'climb',
    cost: 'the light goes out',
    pressure_rung: 1,
    scenes,
    forward_dependencies: [],
    replan_reason: null,
  };
}

describe('the fresh bank', () => {
  it('holds eighty cards, twenty of each kind, with unique ids', () => {
    expect(FRESH_BANK).toHaveLength(80);
    for (const kind of ['place', 'object', 'move', 'constraint'] as const) {
      expect(FRESH_BANK.filter(card => card.kind === kind)).toHaveLength(20);
    }
    expect(new Set(FRESH_BANK.map(card => card.id)).size).toBe(80);
    for (const card of FRESH_BANK) expect(card.text.length).toBeGreaterThan(20);
  });

  it('issues deterministically by chapter and scene', () => {
    expect(freshCard(1, 'CH01_S01')).toEqual(freshCard(1, 'CH01_S01'));
    expect(freshConstraint(2, 'CH02_S01')).toContain(freshCard(2, 'CH02_S01').id);
    const palette = freshPalette(1);
    expect(palette).toHaveLength(4);
    expect(new Set(palette.map(card => card.id)).size).toBe(4);
    expect(freshPalette(1)).toEqual(palette);
    expect(describeFreshPalette(1).split('\n')).toHaveLength(4);
  });
});

describe('the planner and the fresh constraint', () => {
  it('shows the palette to the model and fills a missing scene constraint', async () => {
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(rawPlan([scene()])));
    const planned = await planChapter({
      design: design(), chapter: 1, currentState: emptyState(),
      previousOutcome: '(opening chapter)', openThreads: [], endingRequirements: [],
      remainingWords: 4000,
    }, llm);
    const sent = vi.mocked(llm).mock.calls[0][0];
    expect(sent).toContain('Fresh material');
    expect(planned.scenes[0].fresh_constraint).toBe(freshConstraint(1, 'CH01_S01'));
  });

  it('keeps a constraint the model chose from the palette', async () => {
    const chosen = '[M07/move] test';
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(rawPlan([scene({ fresh_constraint: chosen })])));
    const planned = await planChapter({
      design: design(), chapter: 1, currentState: emptyState(),
      previousOutcome: '(opening chapter)', openThreads: [], endingRequirements: [],
      remainingWords: 4000,
    }, llm);
    expect(planned.scenes[0].fresh_constraint).toBe(chosen);
  });
});

describe('the writer corridor', () => {
  it('briefs voice from the style contract and the scene from the plan', () => {
    const d = design();
    expect(voiceBrief(d.style_contract)).toContain('Distance: close third');
    const brief = sceneBrief(scene());
    expect(brief).toContain('CH01_S01');
    expect(brief).toContain('Must end: Aren reaches the upper room.');
  });

  it('carries the corridor into the P04 package, preferring the planned constraint', () => {
    const withCard = buildSceneContext(design(), emptyState(), scene({ fresh_constraint: '[P03/place] test' }), '', []);
    expect(withCard.vars.voice_brief).toContain('close third');
    expect(withCard.vars.scene_brief).toContain('CH01_S01');
    expect(withCard.vars.fresh_constraint).toBe('[P03/place] test');
    const fallback = buildSceneContext(design(), emptyState(), scene(), '', []);
    expect(fallback.vars.fresh_constraint).toBe(freshConstraint(1, 'CH01_S01'));
    // The corridor renders the P04 prompt with no holes left.
    expect(renderPrompt('P04_SCENE_WRITE', fallback.vars)).not.toMatch(/\{\{\w+\}\}/);
  });

  it('names the fresh constraint in the P03 prompt contract', () => {
    expect(promptVariables('P03_CHAPTER_PLAN')).toContain('fresh_constraint');
    expect(promptVariables('P04_SCENE_WRITE')).toEqual(
      expect.arrayContaining(['voice_brief', 'scene_brief', 'fresh_constraint']),
    );
    const vars: Record<string, string> = {};
    for (const key of promptVariables('P03_CHAPTER_PLAN')) {
      vars[key] = key === 'fresh_constraint' ? '[P01/place] test' : `[${key}]`;
    }
    const rendered = renderPrompt('P03_CHAPTER_PLAN', vars);
    expect(rendered).toContain('[P01/place] test');
    expect(rendered).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('the taste gate: resolution, not retelling', () => {
  it('asks P02 for action, discovery, loss, or commitment instead of a summary', () => {
    const rendered = renderPrompt('P02_PLAN_REVIEW', {
      review_scope: 's', story_contract: 'c', plan: 'p', relevant_state: 'r', source_excerpts: 'e',
    });
    expect(rendered).toMatch(/action, discovery, loss, or commitment/);
  });

  it('leaves a clean scene and a short outcome alone', () => {
    expect(checkReadiness(design(), emptyState(), scene()).map(p => p.code))
      .not.toContain('retelling-suspect');
    expect(retellingSuspect(
      scene({ required_outcome: 'They wait.' }),
      [{ ref: 'Chapter 1', text: 'They wait through the long night together in silence.' }],
    )).toBe('');
  });

  it('flags an outcome that says again what finished prose already proved', () => {
    const prior = [{ ref: 'Chapter 1', text: 'Aren reaches the upper room after the long climb through the storm.' }];
    expect(retellingSuspect(scene(), prior)).toMatch(/retells Chapter 1/);
    expect(checkReadiness(design(), emptyState(), scene(), prior).map(p => p.code))
      .toContain('retelling-suspect');
    const moving = scene({ required_outcome: 'Miro sells the brass lamp for passage money.' });
    expect(retellingSuspect(moving, prior)).toBe('');
  });
});

describe('the thin-scene advisory', () => {
  function gatePlan(scenes: ScenePlan[]) {
    return {
      design: design(),
      chapter: 1,
      plan: rawPlan(scenes),
      spentMechanisms: [] as { mechanism: string; chapters: number[] }[],
      priorRungs: [] as number[],
      recentShapes: [],
      priorOutcomeKinds: [] as string[],
      endingRequirements: [] as string[],
      openThreads: [],
      remainingChapters: 2,
    } as Parameters<typeof checkChapterPlan>[0];
  }

  it('stays quiet on a normally planned scene', () => {
    expect(thinScenePlan(scene())).toBe('');
    expect(checkChapterPlan(gatePlan([scene()])).map(item => item.code))
      .not.toContain('thin-scene');
  });

  it('rides along as an advisory on a scene planned with almost nothing', () => {
    const thin = scene({
      function: '', development: '', required_outcome: 'They talk.',
      pressure_or_uncertainty: '', participant_intentions: [],
    });
    expect(thinScenePlan(thin)).toMatch(/almost nothing/);
    const findings = checkChapterPlan(gatePlan([thin]));
    const flagged = findings.find(item => item.code === 'thin-scene');
    expect(flagged?.severity).toBe('advisory');
  });
});
