import type { ForwardUpdate, ReaderThread, SceneHandoff, ScenePlan, StateDelta, StoryState } from './types';
import type { QuestionResolution } from './tracker';
import { describeUnknown, stringList, unique } from './normalize';

/**
 * The same intention arrives from the next scene's plan with its reason and from the
 * delta without it. Matching on the text before the reason keeps one entry — the
 * longer rendering, so the reason survives.
 */
function uniqueIntentions(items: unknown[]): string[] {
  const kept = new Map<string, string>();
  for (const text of unique(items)) {
    const key = text.replace(/\s*\([^()]*\)\s*$/, '').trim().toLowerCase();
    const previous = kept.get(key);
    if (!previous || text.length > previous.length) kept.set(key, text);
  }
  return [...kept.values()];
}

function deltaChanges(delta: StateDelta): string[] {
  return unique([
    ...delta.events.map(item => item.description),
    ...delta.state_changes.map(item => `${item.entity_id}.${item.field}: ${item.before ?? '(unknown)'} -> ${item.after}`),
    ...delta.knowledge_changes.map(item => `${item.character_id} learned: ${item.learned}`),
    ...delta.belief_changes.map(item => `${item.character_id} now believes: ${item.new_belief || ''}`),
    ...(delta.intentions_and_commitments || []).map(describeUnknown),
    ...(delta.reader_disclosures || []),
  ]);
}

function actualOutcome(delta: StateDelta, scene: ScenePlan, changes: string[]): string {
  return describeUnknown(delta.events.at(-1)?.description
    || delta.state_changes.at(-1)?.after
    || delta.knowledge_changes.at(-1)?.learned
    || changes.at(-1)
    || scene.required_outcome);
}

export function buildSceneHandoff(input: {
  scene: ScenePlan;
  nextScene?: ScenePlan;
  state: StoryState;
  delta: StateDelta;
  resolutions: QuestionResolution[];
  threads: ReaderThread[];
  previous?: SceneHandoff | null;
}): SceneHandoff {
  const changes = deltaChanges(input.delta);
  const resolved = new Set(input.resolutions.filter(item => item.kind !== 'unresolved').map(item => item.question));
  const unresolved = new Set((input.previous?.open_questions || []).filter(question => !resolved.has(question)));
  for (const item of input.delta.uncertainties || []) {
    if (item.relevant_to_next_scene && !resolved.has(item.question)) unresolved.add(item.question);
  }
  for (const item of input.resolutions) {
    if (item.kind === 'unresolved') unresolved.add(item.question);
  }
  for (const thread of input.threads) {
    if (thread.status === 'open') unresolved.add(thread.description);
  }
  const outcome = actualOutcome(input.delta, input.scene, changes);
  return {
    after_scene_id: input.scene.id,
    known_to_reader: unique([
      ...input.state.facts.map(item => item.statement),
      ...input.state.events.map(item => item.description),
      ...input.state.reader_disclosures,
    ]),
    confirmed_changes: changes,
    current_conditions: { ...input.state.conditions },
    open_questions: [...unresolved],
    active_intentions: uniqueIntentions([
      ...(input.nextScene?.participant_intentions || []),
      ...(input.delta.intentions_and_commitments || []).map(describeUnknown),
    ]),
    previous_outcome: outcome,
    required_new_outcome: input.nextScene?.required_outcome || '',
    forbidden_restatements: unique([
      ...(input.previous?.forbidden_restatements || []),
      ...(input.delta.reader_disclosures || []),
      ...input.delta.events.map(item => item.description),
      outcome,
    ]),
  };
}

export function applyForwardToHandoff(handoff: SceneHandoff, forward: ForwardUpdate): SceneHandoff {
  const consequences = stringList(forward.consequences_to_carry_forward);
  const blockers = stringList(forward.unresolved_blockers);
  const next = forward.next_chapter_inputs && typeof forward.next_chapter_inputs === 'object'
    ? forward.next_chapter_inputs : { active_intentions: [], necessary_content: [] };
  const intentions = stringList(next.active_intentions);
  const necessary = stringList(next.necessary_content);
  const chapterOutcome = describeUnknown(forward.chapter_outcome) || handoff.previous_outcome;
  return {
    ...handoff,
    confirmed_changes: unique([...handoff.confirmed_changes, ...consequences]),
    open_questions: unique([...handoff.open_questions, ...blockers]),
    active_intentions: uniqueIntentions(intentions),
    previous_outcome: chapterOutcome,
    required_new_outcome: unique(necessary).join('; '),
    forbidden_restatements: unique([...handoff.forbidden_restatements, chapterOutcome]),
  };
}
