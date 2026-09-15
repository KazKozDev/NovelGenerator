import { renderPrompt, systemContract } from '../prompts';
import { contentWords, sharedDistinctivePhrasing } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import { storyNames } from './tracker';
import { describeShapes, repeatedStaging, sceneShape, type SceneShape, type StagingTolerance } from './shapes';
import { describeRelations, relationsFor } from './relationships';
import { bandsFor, describeProfile, profileOf, readRung } from './profile';
import { describeStateDigest } from './stateDigest';
import { describeWorn, type WornEntry } from './ledger';
import type { BookDesign, ChapterPlan, SceneHandoff, ScenePlan, StoryState } from './types';

/**
 * A required outcome that adds no content word to its own setup: the scene
 * ends where it begins. Deliberately one-directional — an outcome phrased
 * differently but meaning the same slips past code and stays the reviewer's
 * job (STATIC OUTCOME in P02). Code catches only verbatim restatement.
 */
export function isStaticOutcome(setup: string, outcome: string): boolean {
  const from = new Set(contentWords(setup));
  const to = contentWords(outcome);
  return to.length > 0 && to.every(word => from.has(word));
}

/**
 * ChapterPlanner (P03) + ContextBuilder (§6).
 *
 * The planner turns the book design and the confirmed state into the scenes of
 * one chapter only. The context builder then assembles the writer's package from
 * confirmed memory — relevant contract, task, positions, motives, knowledge —
 * never the whole archive. Structured readiness is checked in code (known
 * participants, grounded fact refs); semantic ambiguity stays the model's job
 * and is asked for only when the code checks cannot settle it.
 */

export interface ChapterPlannerInput {
  design: BookDesign;
  chapter: number;
  currentState: StoryState;
  previousOutcome: string;
  openThreads: string[];
  endingRequirements: string[];
  remainingWords: number;
  previousHandoff?: SceneHandoff | null;
  /** Stagings of the accepted scenes, so the plan can vary them instead of repeating them. */
  recentShapes?: SceneShape[];
  /** What the book has already spent of its mechanism ledger, by mechanism. */
  spentMechanisms?: { mechanism: string; chapters: number[] }[];
  /** What the plan gate found wrong with the previous attempt at this chapter. */
  findings?: string;
}

/**
 * What the design allocated to this chapter, and what the book has spent so
 * far, as the planner reads it. The allocation is a commitment the chapter
 * plan answers to: the planner may depart from it, but then it is departing
 * from something stated rather than filling an empty field.
 */
export function describeCommitments(design: BookDesign, chapter: number, spent: { mechanism: string; chapters: number[] }[] = []): string {
  const entry = design.chapter_map.find(item => item.chapter === chapter);
  const profile = profileOf(design);
  const allowance = bandsFor(profile).mechanismReuse;
  const lines = [
    `Allocated to chapter ${chapter}: mechanism "${entry?.mechanism || '(none allocated)'}", cost "${entry?.cost || '(none allocated)'}", pressure rung ${readRung(entry?.pressure_rung) ?? '(none allocated)'}.`,
  ];
  if (profile.mechanism_ledger.length) {
    const used = new Map(spent.map(item => [item.mechanism.toLowerCase(), item.chapters]));
    lines.push(`Mechanism ledger, with what is left of each (allowance ${allowance} chapter(s) per mechanism):`);
    for (const mechanism of profile.mechanism_ledger) {
      const chapters = used.get(mechanism.toLowerCase()) || [];
      const left = allowance - chapters.length;
      lines.push(`- ${mechanism} — ${chapters.length ? `spent in chapter(s) ${chapters.join(', ')}; ` : ''}${left > 0 ? `${left} use(s) left` : 'EXHAUSTED, this chapter cannot draw it'}`);
    }
  }
  return lines.join('\n');
}

export function validateChapterPlan(raw: unknown, chapter: number): ChapterPlan {
  if (!raw || typeof raw !== 'object') throw new Error(`Chapter ${chapter} plan is not an object.`);
  const plan = raw as ChapterPlan;
  if (plan.status === 'needs_replan') return plan;
  if (!Array.isArray(plan.scenes) || !plan.scenes.length) {
    throw new Error(`Chapter ${chapter} plan has no scenes.`);
  }
  const ids = new Set<string>();
  for (const scene of plan.scenes) {
    if (!scene?.id) throw new Error(`Chapter ${chapter} has a scene without an id.`);
    if (ids.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}.`);
    ids.add(scene.id);
    if (!scene.required_outcome) throw new Error(`Scene ${scene.id} has no required outcome.`);
  }
  // The commitments are read, never invented: a chapter that declined to state
  // one carries the refusal explicitly, so the gate can raise it. Absence and
  // refusal are the same fact here, and both are arguable; a silent default
  // would not be.
  return {
    ...plan,
    status: 'ready',
    chapter,
    mechanism: typeof plan.mechanism === 'string' ? plan.mechanism : '',
    cost: typeof plan.cost === 'string' ? plan.cost : '',
    pressure_rung: readRung((plan as { pressure_rung?: unknown }).pressure_rung),
    scenes: plan.scenes.map(scene => ({
      ...scene,
      outcome_kind: typeof scene.outcome_kind === 'string' ? scene.outcome_kind : '',
    })),
  };
}

export async function planChapter(input: ChapterPlannerInput, llm: NovelLLM): Promise<ChapterPlan> {
  const entry = input.design.chapter_map.find(item => item.chapter === input.chapter);
  const system = systemContract();
  const prompt = renderPrompt('P03_CHAPTER_PLAN', {
    book_design_digest: JSON.stringify({
      dramatic_core: input.design.dramatic_core,
      causal_map: input.design.causal_map,
      ending: input.design.ending,
      characters: input.design.characters.map(c => c.id),
    }),
    chapter_number: String(input.chapter),
    chapter_count: String(input.design.chapter_map.length),
    chapter_map_entry: JSON.stringify(entry || {}),
    book_profile: describeProfile(profileOf(input.design)),
    chapter_commitments: describeCommitments(input.design, input.chapter, input.spentMechanisms || []),
    current_state: describeStateDigest(input.currentState),
    previous_chapter_outcome: input.previousOutcome || '(opening chapter)',
    recent_scene_shapes: describeShapes(input.recentShapes || []),
    state_handoff: input.previousHandoff ? JSON.stringify(input.previousHandoff) : '(no earlier accepted scene)',
    open_threads_and_ending_requirements: JSON.stringify({ open_threads: input.openThreads, ending_requirements: input.endingRequirements }),
    remaining_word_budget: String(input.remainingWords),
    plan_findings: input.findings || '(first attempt at this chapter)',
  });
  const raw = await structuredResponse(prompt, system, llm,
    ['status', 'chapter', 'function', 'starting_situation', 'ending_change', 'mechanism', 'cost', 'pressure_rung', 'scenes', 'forward_dependencies', 'replan_reason'],
    parsed => parsed, { temperature: 0.3, maxTokens: 8192, route: 'writer' });
  return validateChapterPlan(raw, input.chapter);
}

const SCENE_KEYS = ['id', 'pov_id', 'location', 'story_time', 'participants', 'initial_conditions',
  'function', 'participant_intentions', 'pressure_or_uncertainty', 'development', 'required_outcome',
  'flexible_elements', 'required_fact_refs', 'required_source_refs', 'setup_or_payoff',
  'transition_to_next', 'target_words', 'outcome_kind'];

export async function rebaseScenePlan(input: {
  design: BookDesign;
  scene: ScenePlan;
  handoff: SceneHandoff;
  state: StoryState;
  openThreads: string[];
}, llm: NovelLLM): Promise<ScenePlan> {
  const system = systemContract();
  const prompt = renderPrompt('P03_SCENE_REBASE', {
    story_contract: JSON.stringify(input.design.contract),
    scene_plan: JSON.stringify(input.scene),
    state_handoff: JSON.stringify({ ...input.handoff, required_new_outcome: input.scene.required_outcome }),
    confirmed_state: describeStateDigest(input.state),
    open_threads: JSON.stringify(input.openThreads),
  });
  const raw = await structuredResponse(prompt, system, llm, SCENE_KEYS, parsed => {
    const candidate = parsed as ScenePlan;
    if (typeof candidate.required_outcome !== 'string' || !candidate.required_outcome.trim()) {
      throw new Error(`Scene ${input.scene.id} rebase returned no required outcome.`);
    }
    if (candidate.id !== input.scene.id) {
      throw new Error(`Scene rebase changed id ${input.scene.id} to ${candidate.id || '(empty)'}.`);
    }
    if (typeof input.handoff.previous_outcome === 'string' && input.handoff.previous_outcome.trim()
      && isStaticOutcome(input.handoff.previous_outcome, candidate.required_outcome)) {
      throw new Error(`Scene ${candidate.id} repeats the accepted outcome instead of advancing it.`);
    }
    return candidate;
  },
    { temperature: 0.2, maxTokens: 8192, route: 'writer' }) as ScenePlan;
  return raw;
}

export interface SceneContext {
  scene: ScenePlan;
  vars: Record<string, string>;
  /** Structural doubts for the model review, not verdicts: code detects, P02 disposes. */
  problems: ReadinessProblem[];
}

export interface ReadinessProblem {
  code: 'pov-absent' | 'empty-task' | 'location-mismatch' | 'missing-fact' | 'missing-source' | 'repeated-staging' | 'restaging-suspect' | 'clash-suspect' | 'static-outcome' | 'unknown-participant';
  detail: string;
}

export interface PriorChapter {
  ref: string;
  text: string;
}

/**
 * Code-level readiness: what the structured memory can state without reading
 * minds. Unknown participants are a plan bug and throw immediately. The rest —
 * a POV outside the scene, an empty task, a recorded location that differs
 * from the scene's, a fact ref the memory never recorded — is returned for the
 * model review. Only the review can tell a premise given (heroes who know each
 * other from the cards, needing no fact) from an invented dependency, or a
 * planned arrival from a teleport.
 */
export function checkReadiness(design: BookDesign, state: StoryState, scene: ScenePlan, priorChapters: PriorChapter[] = [], recentShapes: SceneShape[] = [], tolerance?: StagingTolerance): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  if (scene.pov_id && !(scene.participants || []).includes(scene.pov_id)) {
    const names = new Map(design.characters.map(c => [c.id, c.name]));
    problems.push({
      code: 'pov-absent',
      detail: `POV ${names.get(scene.pov_id) || scene.pov_id} is not among the participants (${(scene.participants || []).join(', ') || 'none'}).`,
    });
  }
  if (!scene.required_outcome?.trim() && !scene.function?.trim()) {
    problems.push({ code: 'empty-task', detail: 'The scene states neither a required outcome nor a function.' });
  }
  // Kinetic sniff: the outcome must move someone's position, possession,
  // knowledge, or commitment past the setup. A restatement in the same words
  // is stasis wearing a plan's clothes; P02 disposes it before prose exists.
  const setupText = [scene.function, scene.development, ...(scene.initial_conditions || [])].filter(Boolean).join('\n');
  if (scene.required_outcome?.trim() && isStaticOutcome(setupText, scene.required_outcome)) {
    problems.push({
      code: 'static-outcome',
      detail: `Scene ${scene.id} ends where it begins: the required outcome restates the setup without changing anyone's position, possession, knowledge, or commitment. Replan the outcome as movement, or let the review confirm the stasis is deliberate.`,
    });
  }
  if (scene.location?.trim()) {
    for (const id of scene.participants || []) {
      const recorded = state.conditions[`${id}.location`];
      if (recorded && recorded.trim() && !sceneContains(recorded, scene.location) && !sceneContains(scene.location, recorded)) {
        problems.push({
          code: 'location-mismatch',
          detail: `${id} was recorded at "${recorded}" and the scene is set at "${scene.location}" with no recorded move.`,
        });
      }
    }
  }
  // Structural repetition: same people, same place, again. Measured on the plan
  // alone, so it costs nothing and lands before a prose token exists.
  const repetition = repeatedStaging(sceneShape(scene), recentShapes, tolerance || bandsFor(profileOf(design)));
  if (repetition) problems.push({ code: 'repeated-staging', detail: repetition });
  // Pre-write restaging sniff: the plan's own wording against finished prose.
  // A shared distinctive phrase means the scene is about to redress an
  // already shown staging — cheapest fixed here, before a prose token exists.
  // The model review disposes it; code only brings the evidence.
  const planText = [scene.location, scene.function, scene.development, scene.required_outcome,
    ...(scene.initial_conditions || [])].filter(Boolean).join('\n');
  for (const prior of priorChapters) {
    if (!prior.text.trim()) continue;
    const shared = sharedDistinctivePhrasing(planText, prior.text);
    if (shared.length) {
      problems.push({
        code: 'restaging-suspect',
        detail: `Scene ${scene.id} shares distinctive phrasing with ${prior.ref}: ${shared.map(phrase => `"${phrase}"`).join(', ')}. If the staging repeats, differentiate it on the page or replan the scene.`,
      });
    }
  }
  return problems;
}

function sceneContains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Assemble the P04 variable package for one scene. Throws on structural gaps —
 * an unknown participant, a required fact the memory does not hold — so the
 * package or the plan is fixed before prose exists, per §6.
 */
export function buildSceneContext(
  design: BookDesign,
  state: StoryState,
  scene: ScenePlan,
  previousTail: string,
  sourceExcerpts: string[] = [],
  priorChapters: PriorChapter[] = [],
  handoff?: SceneHandoff | null,
  recentShapes: SceneShape[] = [],
  worn: WornEntry[] = [],
): SceneContext {
  const known = new Map(design.characters.map(c => [c.id, c]));
  // Who is who is meaning, and meaning is the model's job. Code matches
  // exactly — an id, or a name equal to the cast spelling after folding case
  // and possessives — and asks loudly about everything else. A role where an
  // id should be ("Antagonist") becomes an unknown-participant problem for
  // the P02 review, which maps it against the roster in words; the writer
  // executes the mapping. Nothing is substituted silently, nothing throws.
  const participants = scene.participants || [];
  const problems = checkReadiness(design, state, scene, priorChapters, recentShapes, bandsFor(profileOf(design)));
  for (const entry of participants) {
    const token = entry.trim().toLowerCase().replace(/['’]s\b/g, '').replace(/['’]$/g, '');
    const exact = known.has(entry)
      || design.characters.some(character => character.name.trim().toLowerCase().replace(/['’]s\b/g, '').replace(/['’]$/g, '') === token);
    if (!exact) {
      problems.push({
        code: 'unknown-participant',
        detail: `Scene ${scene.id} lists "${entry}", which is no character id. Map it to the cast roster in the review ("${entry}" is which cast member, by id), or return major with how the scene carries the beat without inventing a person.`,
      });
    }
  }
  const factIds = new Set(state.facts.map(f => f.id));
  const missingFacts = (scene.required_fact_refs || []).filter(id => !factIds.has(id));
  if (missingFacts.length) {
    problems.push({
      code: 'missing-fact',
      detail: `Required fact refs the memory does not hold: ${missingFacts.join('; ')}. If these are premise givens already in character knowledge, the scene may proceed; if they are invented dependencies, it may not.`,
    });
  }
  // Cards only for the exactly matched; the roster below carries the rest
  // for the review's mapping. No null cards reach the writer.
  const cards = scene.participants.map(id => known.get(id)).filter(item => item !== undefined);
  // Decay for the writer's attention, not for memory: shelves keep growing
  // in state, but the package carries the newest eight notes per participant.
  // Beliefs travel whole — they are current by construction, not a log.
  // Reviewers read the full state elsewhere, so nothing verifiable is lost.
  const knowledge: Record<string, { knows: string[]; believes: string[] }> = {};
  for (const id of scene.participants) {
    knowledge[id] = { knows: (state.knowledge[id] || []).slice(-8), believes: state.beliefs[id] || [] };
  }
  const relevantFacts = state.facts.filter(f => (scene.required_fact_refs || []).includes(f.id));
  // Names on record travel into the writer's package verbatim, before a prose
  // token exists: the writer sees the exact spellings memory holds, so drift
  // is prevented rather than repaired.
  const recorded = storyNames(state);
  const named_entities = recorded.length
    ? recorded.map(entry => {
        const alias = entry.aliases.length ? ` (also: ${entry.aliases.join(', ')})` : '';
        const kind = entry.kind ? `${entry.kind}, ` : '';
        return `- ${entry.name}${alias} — ${kind}first seen ${entry.first_seen}`;
      }).join('\n')
    : '(no named entities recorded yet)';
  return {
    scene: scene,
    vars: {
      story_contract: JSON.stringify(design.contract),
      style_contract: JSON.stringify(design.style_contract),
      scene_plan: JSON.stringify(scene),
      scene_start_state: JSON.stringify({
        location: scene.location,
        story_time: scene.story_time,
        participants: scene.participants,
        initial_conditions: scene.initial_conditions,
      }),
      state_handoff: handoff ? JSON.stringify({ ...handoff, required_new_outcome: scene.required_outcome }) : '(no earlier accepted scene)',
      character_cards: JSON.stringify(cards),
      cast_roster: design.characters.map(character =>
        `${character.id} — ${character.name} — ${character.story_function}`).join('\n') || '(cast empty)',
      named_entities,
      // The craft ledger's list, not a window over the previous chapters: a tic
      // that started in chapter two is exactly the one nobody can see by chapter
      // seven, and the book's own declared refrains are already subtracted.
      tired_phrases: describeWorn(worn),
      character_knowledge_and_beliefs: JSON.stringify(knowledge),
      participant_relationships: describeRelations(relationsFor(state, scene.participants || [])),
      relevant_facts: JSON.stringify(relevantFacts),
      source_excerpts: JSON.stringify(sourceExcerpts.length ? sourceExcerpts : (scene.required_source_refs || [])),
      previous_scene_tail: previousTail || '(scene opens the chapter)',
      target_words: String(scene.target_words || 800),
    },
    problems,
  };
}
