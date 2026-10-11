import { designReply } from './designReplies';
import { describe, it, expect, vi } from 'vitest';
import { designBook, readDesignLayer, premiseGivenGaps, premiseNameGaps, validateBookDesign } from '../utils/novel/v2/designer';
import { drainRetryNotices, structuredResponse } from '../utils/novel/v2/llm';
import { calibrateReview, designReviewedBook, reviewPlan, settleReview } from '../utils/novel/v2/reviewer';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
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

function design(chapters = 2): BookDesign {
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
    characters: [{ id: 'C01', name: 'Qux', story_function: 'keeper', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] }],
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
    causal_map: [{ id: 'E01', cause: 'c', actor_id: 'C01', action_or_event: 'a', consequence: 'q', requires: [], enables: [] }],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: Array.from({ length: chapters }, (_, i) => ({
      chapter: i + 1, function: 'f', main_change: 'm', event_ids: ['E01'], dependencies: [], setup_or_payoff: [], pov_id: 'C01', target_words: 2000,
      mechanism: ['climb to the lamp', 'open the door', 'wait out the storm', 'read the log'][i % 4],
      cost: 'the light goes out', pressure_rung: i + 1,
    })),
  };
}

describe('v2 designer', () => {
  it('assembles a design through selection and successive layers', async () => {
    const llm: NovelLLM = vi.fn(async prompt => designReply(prompt, design()) || JSON.stringify(design()));
    const result = await designBook(input, llm);
    expect(result.chapter_map).toHaveLength(2);
    expect(llm).toHaveBeenCalledTimes(4);
  });

  it('names premise givens never placed in the construction', () => {
    const d = design();
    d.contract.premise_givens = [
      { given: 'burning warehouse', kind: 'thing' },
      { given: 'donation check', kind: 'thing' },
      { given: 'cape fibers', kind: 'thing' },
    ];
    expect(premiseGivenGaps(d)).toEqual(['burning warehouse', 'donation check', 'cape fibers']);
    d.causal_map = [{ id: 'E01', cause: 'c', actor_id: 'C01', action_or_event: 'The warehouse burns', consequence: 'q', requires: [], enables: [] }];
    expect(premiseGivenGaps(d)).toEqual(['donation check', 'cape fibers']);
  });

  it('holds declared, repeated, and multi-word premise names, not one-off common nouns', () => {
    const declared = design();
    declared.contract.premise_names = ['Aren', 'Miro'];
    expect(premiseNameGaps(declared, 'A love triangle of Aren, Miro and someone else.'))
      .toEqual(['Aren', 'Miro']);
    expect(premiseNameGaps(design(), 'Hope dies last in the garrison.')).toEqual([]);
    expect(premiseNameGaps(design(), 'Aren Miro inherits the Kex Vum.'))
      .toEqual(['Aren Miro', 'Kex Vum']);
    expect(premiseNameGaps(design(), 'Miro broods. Miro waits.')).toEqual(['Miro']);
    expect(premiseNameGaps(design(), 'A lighthouse keeper finds a door in the sea.')).toEqual([]);
  });

  it('rejects duplicate ids and unknown actors before freezing the structure', () => {
    const d = design();
    d.world_rules[0].id = d.characters[0].id;
    expect(() => readDesignLayer(d, 'structure')).toThrow(/duplicate structure id/);
    const wrongActor = design();
    wrongActor.causal_map[0].actor_id = 'C99';
    expect(() => readDesignLayer(wrongActor, 'structure')).toThrow(/Unknown causal actor/);
  });

  it('refuses repeated chapter numbers', () => {
    const d = design();
    d.chapter_map[1].chapter = 1;
    expect(() => validateBookDesign(d, 2)).toThrow(/chapter number exactly once/);
  });

  it('rejects a design with the wrong chapter count or duplicate ids', () => {
    expect(() => validateBookDesign(design(3), 2)).toThrow(/chapter_map holds 3 entries for 2 chapters/);
    const dup = design();
    dup.world_rules = [{ id: 'C01', rule: 'r', relevant_consequences: [] }];
    expect(() => validateBookDesign(dup, 2)).toThrow(/Duplicate design id/);
  });
});

describe('v2 reviewer', () => {
  it('computes readiness from actual issues and rejects malformed reviews', () => {
    expect(settleReview({ ready: true, issues: [{ severity: 'blocking', target_ref: 'causal_map:E01' }] }).ready).toBe(false);
    expect(settleReview({ ready: false, issues: [] }).ready).toBe(true);
    expect(() => settleReview({ ready: true })).toThrow(/issues array/);
    expect(() => settleReview({ issues: [{ severity: 'unknown', target_ref: 'E01' }] })).toThrow(/invalid/);
  });

  it('never downgrades a newly visible major finding', () => {
    const issue = { id: 'I01', severity: 'major' as const, target_ref: 'causal_map:E09', category: 'causality',
      problem: 'Broken cause', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'fix', suggested_adjustment: 'fix' };
    expect(calibrateReview({ ready: false, issues: [issue] }, new Set(['E01'])).ready).toBe(false);
  });

  it('repairs each level before expanding and preserves approved sections', async () => {
    let reviews = 0;
    const llm: NovelLLM = vi.fn(async (prompt, _system, options) => {
      const reply = designReply(prompt, design());
      if (reply) return reply;
      if (options?.stage === 'design-review') {
        reviews++;
        return JSON.stringify({ ready: true, issues: reviews === 1 ? [{ severity: 'major', target_ref: 'dramatic_core:stakes', problem: 'Weak stakes', required_decision: 'Make stakes specific' }] : [] });
      }
      const d = design();
      // A lower-level response tries to overwrite the approved ending.
      d.ending.central_resolution = 'unauthorized new ending';
      return JSON.stringify(d);
    });
    const result = await designReviewedBook(input, llm);
    expect(result.review.ready).toBe(true);
    expect(result.design.ending.central_resolution).toBe('unauthorized new ending'); // the concept repair approved this version
    expect(result.design.planning_history.rounds.map(item => item.level)).toEqual(['concept', 'concept', 'structure', 'chapters']);
    expect(result.design.planning_history.selection.candidate_index).toBe(0);
  });

  it('discards attempts by a lower layer to rewrite the selected concept', async () => {
    const llm: NovelLLM = vi.fn(async prompt => {
      const reply = designReply(prompt, design());
      if (reply) return reply;
      if (prompt.includes('Check whether')) return JSON.stringify({ ready: true, issues: [] });
      const d = design();
      d.ending.central_resolution = 'wrong ending';
      d.dramatic_core.distinctive_situation = 'wrong premise';
      return JSON.stringify(d);
    });
    const result = await designReviewedBook(input, llm);
    expect(result.design.ending.central_resolution).toBe('r');
    expect(result.design.dramatic_core.distinctive_situation).toBe('s variant 0');
  });

  it('refuses unresolved defects instead of handing them to the writer', async () => {
    const llm: NovelLLM = vi.fn(async prompt => {
      const reply = designReply(prompt, design());
      if (reply) return reply;
      if (prompt.includes('Check whether')) return JSON.stringify({ ready: true, issues: [{ severity: 'major', target_ref: 'dramatic_core:stakes', problem: 'No stakes', required_decision: 'Fix stakes' }] });
      return JSON.stringify(design());
    });
    await expect(designReviewedBook(input, llm, 1)).rejects.toThrow(/concept failed after 2 attempts/);
  });

  it('reopens an upper layer once and rebuilds its descendants', async () => {
    let structuralReviews = 0;
    const stages: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, _system, options) => {
      stages.push(options?.stage || '');
      const reply = designReply(prompt, design());
      if (reply) return reply;
      if (prompt.includes('Check whether')) {
        if (prompt.includes('level structure') && ++structuralReviews === 1) {
          return JSON.stringify({ ready: true, issues: [{ severity: 'blocking', target_ref: 'ending:central_resolution', problem: 'Impossible ending', required_decision: 'Change ending' }] });
        }
        return JSON.stringify({ ready: true, issues: [] });
      }
      return JSON.stringify(design());
    });
    const result = await designReviewedBook(input, llm);
    expect(result.review.ready).toBe(true);
    expect(stages.filter(item => item === 'design-structure')).toHaveLength(2);
    expect(stages).toContain('design-refine-concept');
    expect(result.design.planning_history.rounds.map(item => item.level)).toEqual(['concept', 'structure', 'concept', 'structure', 'chapters']);
  });

  it('stops rather than reopening the same upper layer indefinitely', async () => {
    const llm: NovelLLM = vi.fn(async prompt => {
      const reply = designReply(prompt, design());
      if (reply) return reply;
      if (prompt.includes('Check whether')) return JSON.stringify({ ready: true, issues: prompt.includes('level structure') ?
        [{ severity: 'blocking', target_ref: 'ending:central_resolution', problem: 'Impossible', required_decision: 'Change ending' }] : [] });
      return JSON.stringify(design());
    });
    await expect(designReviewedBook(input, llm)).rejects.toThrow(/concept already reopened once/);
  });

  it('repairs the structure against independent character choices before mapping chapters', async () => {
    let resolutions = 0;
    const stages: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, _system, options) => {
      stages.push(options?.stage || '');
      const reply = designReply(prompt, design());
      if (options?.stage === 'design-intention-resolve' && ++resolutions === 1) {
        const broken = JSON.parse(reply);
        broken.collisions[0].planned_outcome_supported = false;
        broken.collisions[0].reason = 'A plausible refusal blocks the prescribed outcome';
        return JSON.stringify(broken);
      }
      return reply || JSON.stringify(prompt.includes('Check whether') ? { ready: true, issues: [] } : design());
    });
    const result = await designReviewedBook(input, llm);
    expect(result.review.ready).toBe(true);
    expect(stages).toContain('design-refine-structure');
    expect(resolutions).toBe(2);
    expect(result.design.planning_history.rounds.map(item => item.level)).toEqual(['concept', 'structure', 'structure', 'chapters']);
    expect(result.design.planning_history.rounds[1].review.ready).toBe(false);
    expect(result.design.intention_collisions.collisions).toHaveLength(3);
  });

  it('keeps reader diagnostics out of automatic generation', async () => {
    const stages: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, _system, options) => {
      stages.push(options?.stage || '');
      return designReply(prompt, design()) || JSON.stringify(prompt.includes('Check whether') ? { ready: true, issues: [] } : design());
    });
    const result = await designReviewedBook(input, llm);
    expect(result.review.ready).toBe(true);
    expect(stages.some(stage => stage.startsWith('design-reader-'))).toBe(false);
    expect(result.design.reader_understanding).toBeUndefined();
    expect(result.design.intention_collisions?.review.ready).toBe(true);
  });

  it('preserves a complete rejected draft without allowing prose', async () => {
    const saved: BookDesign[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, _system, options) => {
      const reply = designReply(prompt, design());
      if (options?.stage === 'design-review' && prompt.includes('level chapters')) {
        const raw = { ready: false, issues: [] as any[] };
        raw.issues = [{ severity: 'major', target_ref: 'chapter_map:2', problem: 'The decisive action is absent',
          required_decision: 'Show the action' }];
        return JSON.stringify(raw);
      }
      return reply || JSON.stringify(prompt.includes('Check whether') ? { ready: true, issues: [] } : design());
    });
    await expect(designReviewedBook(input, llm, 0, () => {}, draft => saved.push(draft))).rejects.toThrow(/chapters failed/);
    expect(saved).toHaveLength(1);
    expect(saved[0].planning_history?.rounds.at(-1)?.review.ready).toBe(false);
  });

  it('refuses objective allocation problems even when the model accepts', async () => {
    const d = design();
    d.chapter_map[0].cost = '';
    const llm: NovelLLM = vi.fn(async prompt => designReply(prompt, d) ||
      JSON.stringify(prompt.includes('Check whether') ? { ready: true, issues: [] } : d));
    await expect(designReviewedBook(input, llm, 0)).rejects.toThrow(/uncosted|take nothing/);
  });
});

describe('v2 orchestrator', () => {
  function readyLlm(): NovelLLM {
    return vi.fn(async (prompt: string) => {
      const reply = designReply(prompt, design());
      if (reply) return reply;
      if (prompt.includes('Prepare a compact book construction') || prompt.includes('Revise the construction below')) return JSON.stringify(design());
      if (prompt.includes('Check the integrity of the finished book')) {
        return JSON.stringify({
          coverage: { material_examined: 'all', limitations: [] },
          findings: [],
          central_resolution: { supported: true, evidence_refs: [], comment: 'ok' },
          unresolved_major_promises: [],
          need_more_evidence: [],
          summary: 'Clean.',
        });
      }
      return JSON.stringify({ ready: true, issues: [] });
    });
  }

  it('stops PARTIAL with the design kept when no chapter pipeline is attached', async () => {
    const store = new MemoryProjectStore();
    const result = await new Orchestrator(store).runBook(input, readyLlm());
    expect(result.status).toBe('PARTIAL');
    expect(store.loadDesign()?.chapter_map).toHaveLength(2);
    expect(store.checkpoints()).toContain('design');
  });

  it('walks every chapter in order through the injected pipeline', async () => {
    const seen: number[] = [];
    const result = await new Orchestrator(new MemoryProjectStore(), { maxCalls: 200, maxTimeMs: 60000 }, {
      writeChapter: async (_design, chapter) => { seen.push(chapter); return { warnings: [] }; },
    }).runBook(input, readyLlm());
    expect(result.status).toBe('COMPLETE');
    expect(seen).toEqual([1, 2]);
  });

  it('replans a stored draft that predates crystallization before any prose', async () => {
    const store = new MemoryProjectStore();
    store.saveInput(input);
    store.saveDesign(design());
    const llm = readyLlm();
    const result = await new Orchestrator(store).runBook(input, llm);
    expect(result.status).toBe('PARTIAL');
    expect(store.loadDesign()?.planning_history?.rounds).toHaveLength(3);
    expect(llm).toHaveBeenCalledTimes(12);
  });

  it('keeps concept alternatives out of the evidence for cast fidelity', () => {
    const d = design();
    d.contract.premise_names = ['Aren', 'Miro'];
    d.planning_history = { candidates: [{ characters: [{ ...d.characters[0], name: 'Aren Miro' }] }],
      selection: { candidate_index: 0, comparisons: [], reason: 'test' }, rounds: [] };
    expect(premiseNameGaps(d, 'A triangle of Aren, Miro and someone else.')).toEqual(['Aren', 'Miro']);
  });

  it('reports FAILED instead of hanging when the budget is spent', async () => {
    const result = await new Orchestrator(new MemoryProjectStore(), { maxCalls: 1, maxTimeMs: 60000 }).runBook(input, readyLlm());
    expect(result.status).toBe('FAILED');
    expect(result.stoppedReason).toMatch(/budget/);
  });

  it('enforces the estimated token budget', async () => {
    const result = await new Orchestrator(new MemoryProjectStore(), { maxCalls: 200, maxTimeMs: 60000, maxTokens: 10 }).runBook(input, readyLlm());
    expect(result.status).toBe('FAILED');
    expect(result.stoppedReason).toMatch(/Token budget/);
  });

  it('records first-attempt rejections with their reasons', async () => {
    drainRetryNotices();
    let calls = 0;
    const llm: NovelLLM = vi.fn(async () => (++calls === 1 ? 'not json' : '{"a":1}'));
    const result = await structuredResponse('prompt', 'system', llm, ['a'], parsed => parsed);
    expect(result).toEqual({ a: 1 });
    const notices = drainRetryNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0].keys).toEqual(['a']);
    expect(notices[0].attempt).toBe(1);
    expect(drainRetryNotices()).toHaveLength(0);
  });

  it('fails fast on an exhausted output budget instead of retrying identically', async () => {
    drainRetryNotices();
    let calls = 0;
    const llm: NovelLLM = vi.fn(async () => {
      calls++;
      throw new Error('Ollama output reached its token limit; the incomplete response was rejected.');
    });
    await expect(structuredResponse('prompt', 'system', llm, ['a'], parsed => parsed)).rejects.toThrow(/token limit/);
    expect(calls).toBe(1);
  });

  it('retries unclosed JSON once without assuming a token limit', async () => {
    const llm: NovelLLM = vi.fn().mockResolvedValueOnce('{"a":').mockResolvedValueOnce('{"a":1}');
    expect(await structuredResponse('prompt', 'system', llm, ['a'], parsed => parsed)).toEqual({ a: 1 });
    expect(llm).toHaveBeenCalledTimes(2);
    const broken: NovelLLM = vi.fn().mockResolvedValue('{"a":');
    await expect(structuredResponse('prompt', 'system', broken, ['a'], parsed => parsed)).rejects.toThrow(/cause cannot be determined/);
    expect(broken).toHaveBeenCalledTimes(8);
  });

  it('keeps the chapter map as its own artifact', () => {
    const store = new MemoryProjectStore();
    store.saveDesign(design());
    expect(store.loadChapterMap()).toHaveLength(2);
  });
});
