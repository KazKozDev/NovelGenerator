import { describe, it, expect, vi } from 'vitest';
import { naturalizeClaim, softmax } from '../utils/novel/nli';
import { currentGateMode, setGateModeOverride, runPrewriteGate, type GateScorers } from '../utils/novel/v2/semanticGate';
import { emptyState } from '../utils/novel/v2/store';
import type { ChapterPlan, ScenePlan } from '../utils/novel/v2/types';

// No model weights in tests, ever: the gate takes its scorers injected.
const stubScorers = (rerankScores: number[], nliContradiction: number): GateScorers & { rerank: ReturnType<typeof vi.fn>; scoreNLI: ReturnType<typeof vi.fn> } => ({
  rerank: vi.fn(async () => rerankScores),
  scoreNLI: vi.fn(async () => ({ contradiction: nliContradiction, entailment: 0, neutral: 1 - nliContradiction })),
});

const scene = (overrides: Partial<ScenePlan> = {}): ScenePlan => ({
  id: 'CH02_S01',
  pov_id: 'C01',
  location: 'Lamp room',
  story_time: 'Night',
  participants: ['C01'],
  initial_conditions: ['Zor tends the lamp.'],
  function: 'An uneasy night together.',
  participant_intentions: [{ character_id: 'C01', intention: 'Stay awake until dawn.', reason_now: 'The storm.' }],
  pressure_or_uncertainty: 'Whether the light holds.',
  development: 'The lamp room held its light while they waited.',
  required_outcome: 'They wait by the lamp.',
  flexible_elements: [],
  required_fact_refs: [],
  required_source_refs: [],
  setup_or_payoff: [],
  transition_to_next: '',
  target_words: 300,
  outcome_kind: 'position',
  ...overrides,
});

const plan = (scenes: ScenePlan[]): ChapterPlan => ({
  status: 'ready',
  chapter: 2,
  function: '',
  starting_situation: '',
  ending_change: '',
  mechanism: 'tend the lamp',
  cost: 'a night of sleep',
  pressure_rung: 2,
  scenes,
  forward_dependencies: [],
  replan_reason: null,
});

const prior = [{ ref: 'Chapter 1', text: 'The lamp room held its light over the stairs through the storm. Zor watched the long night.' }];

describe('semantic pre-write gate', () => {
  it('flags a paraphrase-level retelling with its evidence', async () => {
    const scorers = stubScorers([4.9], 0.1);
    const result = await runPrewriteGate(plan([scene()]), prior, emptyState(), scorers, 'full');
    const problems = result.problems.get('CH02_S01') || [];
    expect(problems.some(p => p.code === 'restaging-suspect' && p.detail.includes('Chapter 1'))).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('stays quiet below the fitted threshold', async () => {
    const scorers = stubScorers([4.49], 0.1);
    const result = await runPrewriteGate(plan([scene()]), prior, emptyState(), scorers, 'full');
    expect(result.problems.get('CH02_S01') || []).toEqual([]);
  });

  it('flags a plan-vs-memory clash with both sides quoted', async () => {
    const scorers = stubScorers([0.5], 0.92);
    const state = { ...emptyState(), conditions: { 'C01.location': 'Harbor' } };
    const scenes = [scene({ required_outcome: 'Zor stays at the lighthouse by the harbor.' })];
    const result = await runPrewriteGate(plan(scenes), prior, state, scorers, 'full');
    const problems = result.problems.get('CH02_S01') || [];
    expect(problems.some(p => p.code === 'clash-suspect')).toBe(true);
  });

  it('never calls a model when disabled', async () => {
    const scorers = stubScorers([9.9], 0.99);
    const result = await runPrewriteGate(plan([scene()]), prior, emptyState(), scorers, 'off');
    expect(scorers.rerank).not.toHaveBeenCalled();
    expect(scorers.scoreNLI).not.toHaveBeenCalled();
    expect(result.problems.size).toBe(0);
  });

  it('has no mode that claims coverage it does not have', async () => {
    // A light mode ran a small embedder, reported "paraphrase restaging" in the
    // run log, and let a scene be retold nearly beat for beat from one chapter
    // to the next. Either the cross-encoder reads the pair, or nothing claims to.
    const scorers: GateScorers = {
      rerank: vi.fn(async () => [9]),
      scoreNLI: vi.fn(async () => ({ contradiction: 0, entailment: 0, neutral: 1 })),
    };
    const result = await runPrewriteGate(plan([scene()]), prior, emptyState(), scorers, 'full');
    expect(result.mode).toBe('full');
    expect(scorers.rerank).toHaveBeenCalled();
    const off = await runPrewriteGate(plan([scene()]), prior, emptyState(), scorers, 'off');
    expect(off.mode).toBe('off');
    expect(off.problems.size).toBe(0);
  });

  it('ignores any stored setting: a browser always gets the whole check', () => {
    // There is no switch any more. A value left over from when there was one —
    // 'light', 'off', anything — must not quietly hold a reader at less than
    // the full check for every book they write afterwards.
    for (const stored of ['light', 'off', 'on', null]) {
      vi.stubGlobal('localStorage', { getItem: () => stored, setItem: () => {}, removeItem: () => {} } as unknown as Storage);
      try {
        expect(currentGateMode(), `stored ${stored}`).toBe('full');
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });

  it('stays off only where there is nobody to consent to the download', () => {
    // Not a setting — a runtime fact. A test suite that reached for 780MB of
    // weights would not be a test suite, and a script says otherwise for itself.
    expect(currentGateMode()).toBe('off');
  });

  it('lets a runner without storage say what it wants', () => {
    expect(currentGateMode()).toBe('off');
    setGateModeOverride('full');
    try {
      expect(currentGateMode()).toBe('full');
    } finally {
      setGateModeOverride(null);
    }
    expect(currentGateMode()).toBe('off');
  });

  it('degrades to warnings when a scorer dies, never failing the run', async () => {
    const scorers: GateScorers = {
      rerank: async () => { throw new Error('worker gone'); },
      scoreNLI: async () => ({ contradiction: 0, entailment: 0, neutral: 1 }),
    };
    const result = await runPrewriteGate(plan([scene()]), prior, emptyState(), scorers, 'full');
    expect(result.problems.size).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/unavailable/);
  });
});

describe('nli pure helpers', () => {
  it('naturalizes telegraphic claims into propositions', () => {
    expect(naturalizeClaim('Zor location: Harbor')).toBe('Zor is at Harbor.');
    expect(naturalizeClaim('Already a sentence.')).toBe('Already a sentence.');
  });

  it('softmax normalizes to a distribution', () => {
    const out = softmax([2, 1, 0]);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(out[0]).toBeGreaterThan(out[2]);
    expect(softmax([])).toEqual([]);
  });
});
