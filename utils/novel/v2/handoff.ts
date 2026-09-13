import type { ForwardUpdate, ReaderThread, SceneHandoff, ScenePlan, StateDelta, StoryState } from './types';
import type { QuestionResolution } from './tracker';

function describeUnknown(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(describeUnknown).filter(Boolean).join('; ');
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  if (typeof item.character_id === 'string' && typeof item.intention === 'string') {
    return `${item.character_id}: ${item.intention}`;
  }
  for (const key of ['description', 'consequence', 'commitment', 'intention', 'decision', 'action', 'question', 'content', 'outcome']) {
    if (typeof item[key] === 'string') return (item[key] as string).trim();
  }
  try { return JSON.stringify(value); } catch { return ''; }
}

/** LLM JSON schemas constrain the top level, but some models wrap list entries in objects. */
function unique(items: unknown[]): string[] {
  return [...new Set(items.map(describeUnknown).filter(Boolean))];
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
    active_intentions: unique([
      ...(input.nextScene?.participant_intentions || []).map(item => `${item.character_id}: ${item.intention} (${item.reason_now})`),
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
  const consequences = Array.isArray(forward.consequences_to_carry_forward) ? forward.consequences_to_carry_forward : [];
  const blockers = Array.isArray(forward.unresolved_blockers) ? forward.unresolved_blockers : [];
  const next = forward.next_chapter_inputs && typeof forward.next_chapter_inputs === 'object'
    ? forward.next_chapter_inputs : { active_intentions: [], necessary_content: [] };
  const intentions = Array.isArray(next.active_intentions) ? next.active_intentions : [];
  const necessary = Array.isArray(next.necessary_content) ? next.necessary_content : [];
  const chapterOutcome = describeUnknown(forward.chapter_outcome) || handoff.previous_outcome;
  return {
    ...handoff,
    confirmed_changes: unique([...handoff.confirmed_changes, ...consequences]),
    open_questions: unique([...handoff.open_questions, ...blockers]),
    active_intentions: unique(intentions),
    previous_outcome: chapterOutcome,
    required_new_outcome: unique(necessary).join('; '),
    forbidden_restatements: unique([...handoff.forbidden_restatements, chapterOutcome]),
  };
}
