import type { ForwardUpdate, ReaderThread, SceneHandoff, ScenePlan, StateDelta, StoryState } from './types';
import type { QuestionResolution } from './tracker';
import { describeUnknown, stringList, unique } from './normalize';
import { DEFAULT_DIGEST } from './stateDigest';

/**
 * How much of the book a handoff carries.
 *
 * The handoff is the writing contract between two scenes, and it was built as
 * if it were the ledger: every fact, every event and every disclosure since
 * page one under `known_to_reader`, and the same list again, accumulated scene
 * by scene, under `forbidden_restatements`. Measured on a finished four-chapter
 * book it grew by about 4KB a scene — 5KB after the first, 70KB after the
 * sixteenth, with 237 things the writer was told not to restate — and it goes
 * whole into three prompts: the chapter plan, the scene rebase and the scene
 * itself. Twenty chapters at that rate is a third of a megabyte in front of
 * every scene.
 *
 * Two things break before that. A local model's context fills, and Ollama
 * drops the start of a prompt that does not fit — which in the scene prompt is
 * the task and the plan, leaving the writer the tail of the previous scene and
 * nothing to do but write it again. And long before the window fills the list
 * has stopped working: nobody, model or person, holds two hundred prohibitions
 * while writing a page.
 *
 * So it carries the recent stretch, the same stretch `stateDigest` gives every
 * other call. Facts stay whole — they are few and they are what a scene is
 * checked against. Nothing is lost: the state store keeps the full record,
 * retrieval resolves references against the store, and the cross-encoder reads
 * the finished prose itself for a scene retold from ten chapters back.
 *
 * The two limits below are judgements, not measurements: about what the last
 * chapter put on the page.
 */
export const HANDOFF_LIMITS = {
  /** Meanings the writer is told not to explain again: the most recent, because those are the ones it is tempted to. */
  restatements: 24,
  /** Questions still open, newest last. Standing promises reach the planner whole through the thread ledger. */
  questions: 24,
  /**
   * Facts, newest last. The shelf itself is whole wherever something is checked
   * against it — the tracker, the chapter check, the planner's digest. The
   * writer is not checking: it gets the facts its scene cites under
   * `relevant_facts`, and here only the recent ones, or the shelf that was
   * built so particulars would stop scrolling away becomes the next list that
   * grows by the scene in front of every scene.
   */
  facts: 24,
};

function recent<T>(items: T[], limit: number): T[] {
  return items.length > limit ? items.slice(-limit) : items;
}

function historyNote(parts: { label: string; kept: number; total: number }[]): string | undefined {
  const trimmed = parts.filter(part => part.total > part.kept);
  if (!trimmed.length) return undefined;
  // Said plainly, for the reason the state digest says it: a model that
  // believes it is seeing the whole record reasons as though anything absent
  // from it never happened.
  return `These lists hold ${trimmed.map(part => `the ${part.kept} most recent of ${part.total} ${part.label}`).join(', ')}. Everything earlier happened, still holds, and is already known to the reader; it is simply not listed here.`;
}

/**
 * A handoff stored before the limits existed, brought inside them. A resumed
 * book would otherwise plan its next chapter against the whole of the old one.
 */
export function compactHandoff(handoff: SceneHandoff): SceneHandoff {
  const known = DEFAULT_DIGEST.events + DEFAULT_DIGEST.disclosures;
  if (handoff.forbidden_restatements.length <= HANDOFF_LIMITS.restatements
    && handoff.open_questions.length <= HANDOFF_LIMITS.questions) return handoff;
  const knownToReader = recent(handoff.known_to_reader, Math.max(known, HANDOFF_LIMITS.restatements));
  return {
    ...handoff,
    known_to_reader: knownToReader,
    open_questions: recent(handoff.open_questions, HANDOFF_LIMITS.questions),
    forbidden_restatements: recent(handoff.forbidden_restatements, HANDOFF_LIMITS.restatements),
    history_note: handoff.history_note || historyNote([
      { label: 'things the reader knows', kept: knownToReader.length, total: handoff.known_to_reader.length },
      { label: 'open questions', kept: Math.min(handoff.open_questions.length, HANDOFF_LIMITS.questions), total: handoff.open_questions.length },
    ]),
  };
}

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
  ]);
  // The scene's disclosures are not repeated here. They are already the newest
  // entries of forbidden_restatements and of known_to_reader, and a third copy
  // was a quarter of the handoff on a run with a thorough editor.
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
  const events = recent(input.state.events, DEFAULT_DIGEST.events);
  const disclosures = recent(input.state.reader_disclosures, DEFAULT_DIGEST.disclosures);
  const questions = [...unresolved];
  const facts = recent(input.state.facts, HANDOFF_LIMITS.facts);
  const note = historyNote([
    { label: 'facts on record', kept: facts.length, total: input.state.facts.length },
    { label: 'recorded events', kept: events.length, total: input.state.events.length },
    { label: 'reader disclosures', kept: disclosures.length, total: input.state.reader_disclosures.length },
    { label: 'open questions', kept: Math.min(questions.length, HANDOFF_LIMITS.questions), total: questions.length },
  ]);
  return {
    after_scene_id: input.scene.id,
    known_to_reader: unique([
      ...facts.map(item => item.statement),
      ...events.map(item => item.description),
      ...disclosures,
    ]),
    confirmed_changes: changes,
    current_conditions: { ...input.state.conditions },
    open_questions: recent(questions, HANDOFF_LIMITS.questions),
    active_intentions: uniqueIntentions([
      ...(input.nextScene?.participant_intentions || []),
      ...(input.delta.intentions_and_commitments || []).map(describeUnknown),
    ]),
    previous_outcome: outcome,
    required_new_outcome: input.nextScene?.required_outcome || '',
    forbidden_restatements: recent(unique([
      ...(input.previous?.forbidden_restatements || []),
      // Events first, disclosures after: the list keeps its newest entries, and
      // what a writer explains twice is a meaning, far more often than a deed.
      ...input.delta.events.map(item => item.description),
      ...stringList(input.delta.reader_disclosures),
      outcome,
    ]), HANDOFF_LIMITS.restatements),
    ...(note ? { history_note: note } : {}),
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
    open_questions: recent(unique([...handoff.open_questions, ...blockers]), HANDOFF_LIMITS.questions),
    active_intentions: uniqueIntentions(intentions),
    previous_outcome: chapterOutcome,
    required_new_outcome: unique(necessary).join('; '),
    forbidden_restatements: recent(unique([...handoff.forbidden_restatements, chapterOutcome]), HANDOFF_LIMITS.restatements),
  };
}

/**
 * The handoff as each reader of it needs it.
 *
 * The whole object used to go to everyone: the chapter planner, which also
 * receives the state digest those lists were built from, and the writer, which
 * was handed forty-five things the reader knows and ninety changes the last
 * scene made — thirty to fifty kilobytes in front of a scene of six — to be
 * told, in effect, where things stand and what not to say twice. On the
 * measured runs the pipeline sent forty-five to sixty-seven times the book it
 * wrote, and the handoff was the largest single thing in the writer's prompt.
 *
 * The stored handoff is unchanged. These are views of it.
 */

/** For a call that also receives the state digest: only what the digest does not carry. */
export function plannerHandoff(handoff: SceneHandoff): Record<string, unknown> {
  return {
    after_scene_id: handoff.after_scene_id,
    previous_outcome: handoff.previous_outcome,
    required_new_outcome: handoff.required_new_outcome,
    open_questions: handoff.open_questions,
    active_intentions: handoff.active_intentions,
    forbidden_restatements: handoff.forbidden_restatements,
  };
}

/** How many of the newest restatements and questions a scene's writer is shown. Judgements. */
export const WRITER_HANDOFF = { restatements: 12, questions: 8 };

/**
 * For the writer of one scene: where the last scene left things, what is still
 * open, what the reader has just been told, and where the people in this scene
 * stand. Conditions of characters who are not in the scene are left out; those
 * of things and places stay, because a scene can walk into any of them.
 */
export function writerHandoff(handoff: SceneHandoff, participants: string[], castIds: string[]): Record<string, unknown> {
  const present = new Set(participants);
  const absent = castIds.filter(id => !present.has(id));
  const conditions = Object.fromEntries(Object.entries(handoff.current_conditions || {}).filter(([key]) => {
    const subject = key.split(/->|\./)[0].trim();
    return !absent.includes(subject) || (key.includes('->') && participants.some(id => key.includes(`->${id}.`)));
  }));
  return {
    after_scene_id: handoff.after_scene_id,
    previous_outcome: handoff.previous_outcome,
    required_new_outcome: handoff.required_new_outcome,
    current_conditions: conditions,
    open_questions: recent(handoff.open_questions, WRITER_HANDOFF.questions),
    active_intentions: handoff.active_intentions,
    already_told_do_not_explain_again: recent(handoff.forbidden_restatements, WRITER_HANDOFF.restatements),
  };
}
