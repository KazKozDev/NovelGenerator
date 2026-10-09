import { describe, expect, it } from 'vitest';
import { applyForwardToHandoff, buildSceneHandoff, compactHandoff, HANDOFF_LIMITS } from '../utils/novel/v2/handoff';
import { DEFAULT_DIGEST } from '../utils/novel/v2/stateDigest';
import type { ForwardUpdate, SceneHandoff, ScenePlan, StateDelta, StoryState } from '../utils/novel/v2/types';

const scene = (id: string): ScenePlan => ({
  id, pov_id: 'C01', location: 'Lighthouse', story_time: 'night', participants: ['C01'], initial_conditions: [],
  function: 'f', participant_intentions: [], pressure_or_uncertainty: '', development: '',
  required_outcome: 'Aren opens the outer door.', flexible_elements: [], required_fact_refs: [],
  required_source_refs: [], setup_or_payoff: [], transition_to_next: '', target_words: 800, outcome_kind: 'position',
});

function delta(index: number): StateDelta {
  return {
    proper_names: [], name_variants: [],
    events: [0, 1, 2, 3].map(step => ({ description: `Event ${index}.${step} happens.`, participants: ['C01'], evidence_refs: ['p1'] })),
    state_changes: [], knowledge_changes: [], belief_changes: [], intentions_and_commitments: [],
    reader_disclosures: [`Disclosure ${index}.a`, `Disclosure ${index}.b`],
    threads_opened: [], threads_resolved: [], contradictions: [],
    uncertainties: [{ question: `Question ${index}?`, evidence_refs: ['p1'], relevant_to_next_scene: true }],
    plan_deviations: [],
  };
}

/** A book of `scenes` scenes, folded the way the pipeline folds it, handoff carried forward. */
function write(scenes: number): { handoffs: SceneHandoff[]; state: StoryState } {
  const state: StoryState = {
    facts: [{ id: 'F1', statement: 'The door answers to the lamp.', evidence_refs: ['p1'] }],
    events: [], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [], names: [],
  };
  const handoffs: SceneHandoff[] = [];
  for (let index = 1; index <= scenes; index++) {
    const change = delta(index);
    change.events.forEach((event, step) => state.events.push({ id: `S${index}-e${step + 1}`, ...event }));
    state.reader_disclosures.push(...change.reader_disclosures);
    handoffs.push(buildSceneHandoff({
      scene: scene(`CH01_S${String(index).padStart(2, '0')}`), state, delta: change, resolutions: [], threads: [],
      previous: handoffs.at(-1) || null,
    }));
  }
  return { handoffs, state };
}

describe('a handoff the length of a scene, not of the book', () => {
  it('stops growing once the book is longer than the stretch it carries', () => {
    const { handoffs } = write(80);
    const size = (handoff: SceneHandoff) => JSON.stringify(handoff).length;
    // Eighty scenes is a twenty-chapter book. Unbounded, the last handoff was
    // forty times the size of the tenth.
    expect(size(handoffs[79])).toBeLessThan(size(handoffs[19]) * 1.1);
    const last = handoffs[79];
    expect(last.forbidden_restatements).toHaveLength(HANDOFF_LIMITS.restatements);
    expect(last.open_questions).toHaveLength(HANDOFF_LIMITS.questions);
    expect(last.known_to_reader).toHaveLength(1 + DEFAULT_DIGEST.events + DEFAULT_DIGEST.disclosures);
  });

  it('keeps every fact, the newest of everything else, and says what it left out', () => {
    const last = write(80).handoffs[79];
    expect(last.known_to_reader).toContain('The door answers to the lamp.');
    expect(last.known_to_reader).toContain('Event 80.3 happens.');
    expect(last.known_to_reader).not.toContain('Event 1.0 happens.');
    expect(last.forbidden_restatements).toContain('Disclosure 80.b');
    expect(last.open_questions.at(-1)).toBe('Question 80?');
    expect(last.history_note).toMatch(/the 24 most recent of 320 recorded events/);
    expect(last.history_note).toMatch(/Everything earlier happened, still holds/);
  });

  it('adds no note to a book short enough to carry whole', () => {
    const first = write(2).handoffs[1];
    expect(first.history_note).toBeUndefined();
    expect(first.known_to_reader).toContain('Event 1.0 happens.');
  });

  it('brings a handoff stored before the limits inside them, and leaves a current one alone', () => {
    const many = (label: string, count: number) => Array.from({ length: count }, (_, index) => `${label} ${index + 1}`);
    const legacy: SceneHandoff = {
      after_scene_id: 'CH04_S04', known_to_reader: many('Known', 240), confirmed_changes: [], current_conditions: {},
      open_questions: many('Question', 55), active_intentions: [], previous_outcome: 'o', required_new_outcome: '',
      forbidden_restatements: many('Told', 237),
    };
    const compact = compactHandoff(legacy);
    expect(compact.forbidden_restatements).toHaveLength(HANDOFF_LIMITS.restatements);
    expect(compact.forbidden_restatements.at(-1)).toBe('Told 237');
    expect(compact.known_to_reader).toHaveLength(DEFAULT_DIGEST.events + DEFAULT_DIGEST.disclosures);
    expect(compact.open_questions.at(-1)).toBe('Question 55');
    expect(compact.history_note).toMatch(/most recent of 240 things the reader knows/);
    const current = write(80).handoffs[79];
    expect(compactHandoff(current)).toBe(current);
  });

  it('stays inside the limits after the chapter reconciliation adds to it', () => {
    const last = write(80).handoffs[79];
    const forward = {
      chapter_outcome: 'The chapter ends with the door open.', consequences_to_carry_forward: [],
      next_chapter_inputs: { starting_situation: '', active_intentions: [], necessary_content: [], relevant_fact_refs: [], source_refs_to_retrieve: [] },
      plan_updates: [], ending_readiness: { established_requirements: [], remaining_requirements: [], capacity_problems: [] },
      unresolved_blockers: ['Who cut the fuel line?'],
    } as ForwardUpdate;
    const enriched = applyForwardToHandoff(last, forward);
    expect(enriched.forbidden_restatements).toHaveLength(HANDOFF_LIMITS.restatements);
    expect(enriched.forbidden_restatements.at(-1)).toBe('The chapter ends with the door open.');
    expect(enriched.open_questions.at(-1)).toBe('Who cut the fuel line?');
    expect(enriched.open_questions).toHaveLength(HANDOFF_LIMITS.questions);
  });
});
