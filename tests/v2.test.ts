import { describe, it, expect, vi } from 'vitest';
import { designBook, premiseGivenGaps, premiseNameGaps, validateBookDesign } from '../utils/novel/v2/designer';
import { drainRetryNotices, structuredResponse } from '../utils/novel/v2/llm';
import { calibrateReview, designReviewedBook, reviewPlan, settleReview } from '../utils/novel/v2/reviewer';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
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

function design(chapters = 2): BookDesign {
  return {
    contract: { explicit_requirements: [], inferred_decisions: [], language: 'English', tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'd', attention: 'a', register: 'r', humor: 'h', emotional_expression: 'e' },
    characters: [{ id: 'C01', name: 'Qux', story_function: 'keeper', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] }],
    world_rules: [{ id: 'R01', rule: 'r', relevant_consequences: [] }],
    causal_map: [{ id: 'E01', cause: 'c', actor_id: 'C01', action_or_event: 'a', consequence: 'q', requires: [], enables: [] }],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: Array.from({ length: chapters }, (_, i) => ({
      chapter: i + 1, function: 'f', main_change: 'm', event_ids: [], dependencies: [], setup_or_payoff: [], pov_id: 'C01', target_words: 2000,
    })),
  };
}

describe('v2 designer', () => {
  it('accepts a well-formed design from one call', async () => {
    const llm: NovelLLM = vi.fn(async () => JSON.stringify(design()));
    const result = await designBook(input, llm);
    expect(result.chapter_map).toHaveLength(2);
    expect(llm).toHaveBeenCalledTimes(1);
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
    declared.contract.premise_names = ['Zor', 'Pax'];
    expect(premiseNameGaps(declared, 'A love triangle of Zor, Pax and someone else.'))
      .toEqual(['Zor', 'Pax']);
    expect(premiseNameGaps(design(), 'Hope dies last in the garrison.')).toEqual([]);
    expect(premiseNameGaps(design(), 'Zor Pax inherits the Kex Vum.'))
      .toEqual(['Zor Pax', 'Kex Vum']);
    expect(premiseNameGaps(design(), 'Pax broods. Pax waits.')).toEqual(['Pax']);
    expect(premiseNameGaps(design(), 'A lighthouse keeper finds a door in the sea.')).toEqual([]);
  });

  it('rejects a design with the wrong chapter count or duplicate ids', () => {
    expect(() => validateBookDesign(design(3), 2)).toThrow(/chapter_map holds 3 entries for 2 chapters/);
    const dup = design();
    dup.world_rules = [{ id: 'C01', rule: 'r', relevant_consequences: [] }];
    expect(() => validateBookDesign(dup, 2)).toThrow(/Duplicate design id/);
  });
});

describe('v2 reviewer', () => {
  it('computes readiness from blocking issues, not from the model flag', () => {
    const blocking = settleReview({ ready: true, issues: [{ severity: 'blocking', target_ref: 'E01' }] });
    expect(blocking.ready).toBe(false);
    const clean = settleReview({ ready: false, issues: [{ severity: 'optional', target_ref: 'E01' }] });
    expect(clean.ready).toBe(true);
  });

  it('refines a blocked design and returns once the review passes', async () => {
    let reviews = 0;
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Refine the previous plan against these findings')) return JSON.stringify(design());
      if (prompt.includes('Prepare a compact book construction')) return JSON.stringify(design());
      if (prompt.includes('Check whether the provided plan is ready')) {
        reviews++;
        return reviews === 1
          ? JSON.stringify({ ready: false, issues: [{ id: 'I01', severity: 'blocking', target_ref: 'E01', category: 'causality', problem: 'No cause', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's' }] })
          : JSON.stringify({ ready: true, issues: [] });
      }
      return JSON.stringify(design());
    });
    const { design: result, review } = await designReviewedBook(input, llm, 2);
    expect(review.ready).toBe(true);
    expect(result.chapter_map).toHaveLength(2);
  });

  it('downgrades a first-time major on re-review to optional', () => {
    const review = calibrateReview({ ready: false, issues: [{
      id: 'I01', severity: 'major', target_ref: 'E09', category: 'causality', problem: 'Why enter?',
      evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's',
    }] }, new Set(['E01']));
    expect(review.ready).toBe(true);
    expect(review.issues[0].severity).toBe('optional');
  });

  it('keeps a repeated major and any blocking at full severity', () => {
    const seen = new Set(['E01']);
    const residual = calibrateReview({ ready: false, issues: [{
      id: 'I01', severity: 'major', target_ref: 'E01', category: 'causality', problem: 'Still no cause',
      evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's',
    }] }, seen);
    expect(residual.ready).toBe(false);
    const blocking = calibrateReview({ ready: false, issues: [{
      id: 'I02', severity: 'blocking', target_ref: 'R01', category: 'coherence', problem: 'Paradox',
      evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's',
    }] }, seen);
    expect(blocking.ready).toBe(false);
  });

  it('passes when the re-review raises only a new major', async () => {
    let reviews = 0;
    const issue = (severity: string, target: string) => JSON.stringify({
      ready: false, issues: [{ id: 'I01', severity, target_ref: target, category: 'causality', problem: 'p', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's' }],
    });
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Refine the previous plan against these findings')) return JSON.stringify(design());
      if (prompt.includes('Prepare a compact book construction')) return JSON.stringify(design());
      if (prompt.includes('Check whether the provided plan is ready')) {
        reviews++;
        if (reviews === 1) return issue('blocking', 'R01');
        return issue('major', 'E09');
      }
      return JSON.stringify(design());
    });
    const { review } = await designReviewedBook(input, llm, 2);
    expect(review.ready).toBe(true);
  });

  it('still fails loudly on a residual major after a re-review', async () => {
    let reviews = 0;
    const issue = (severity: string, target: string) => JSON.stringify({
      ready: false, issues: [{ id: 'I01', severity, target_ref: target, category: 'causality', problem: 'p', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's' }],
    });
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Refine the previous plan against these findings')) return JSON.stringify(design());
      if (prompt.includes('Prepare a compact book construction')) return JSON.stringify(design());
      if (prompt.includes('Check whether the provided plan is ready')) {
        reviews++;
        return reviews === 1 ? issue('blocking', 'R01') : issue('major', 'R01');
      }
      return JSON.stringify(design());
    });
    // The objection survives the rounds, so it is written into the contract the
    // chapters must satisfy — a judgement the prose can answer never ends a book.
    const settled = await designReviewedBook(input, llm, 1);
    expect(settled.review.ready).toBe(false);
    expect(settled.design.contract.explicit_requirements.join(' ')).toContain('R01');
  });

  it('refuses a coherent design that recasts premise names out of the book', async () => {
    const triangle: ProjectInput = { ...input, premise: 'A love triangle of Zor, Pax and someone else.' };
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Prepare a compact book construction')) {
        const d = design();
        d.contract.premise_names = ['Zor', 'Pax'];
        return JSON.stringify(d);
      }
      return JSON.stringify({ ready: true, issues: [] });
    });
    await expect(designReviewedBook(triangle, llm, 0)).rejects.toThrow(/Pax/);
  });

  it('carries the reviewer objection into the contract when fixes run out', async () => {
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Check whether the provided plan is ready')) {
        return JSON.stringify({ ready: false, issues: [{ id: 'I01', severity: 'blocking', target_ref: 'E01', category: 'causality', problem: 'No cause', evidence_refs: [], consequence_for_writing: 'x', required_decision: 'd', suggested_adjustment: 's' }] });
      }
      return JSON.stringify(design());
    });
    await expect(reviewPlan(
      { story_language: 'English', planning_language: 'English', story_contract: '{}' },
      'scope', design(), '', '', llm,
    )).resolves.toMatchObject({ ready: false });
    const settled = await designReviewedBook(input, llm, 0);
    expect(settled.review.ready).toBe(false);
    expect(settled.design.contract.explicit_requirements.join(' ')).toContain('E01: d');
  });

  it('still refuses when what code charges is unresolved', async () => {
    // A premise name nobody answers to is not a judgement the prose can answer:
    // the book would not be the book that was asked for.
    const triangle: ProjectInput = { ...input, premise: 'A love triangle of Zor, Pax and someone else.' };
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('Prepare a compact book construction') || prompt.includes('Refine the previous plan against these findings')) {
        const d = design();
        d.contract.premise_names = ['Zor', 'Pax'];
        return JSON.stringify(d);
      }
      return JSON.stringify({ ready: true, issues: [] });
    });
    await expect(designReviewedBook(triangle, llm, 1)).rejects.toThrow(/not executable[\s\S]*Pax/);
  });
});

describe('v2 orchestrator', () => {
  function readyLlm(): NovelLLM {
    return vi.fn(async (prompt: string) => {
      if (prompt.includes('Prepare a compact book construction') || prompt.includes('Refine the previous plan against these findings')) return JSON.stringify(design());
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

  it('keeps the chapter map as its own artifact', () => {
    const store = new MemoryProjectStore();
    store.saveDesign(design());
    expect(store.loadChapterMap()).toHaveLength(2);
  });
});
