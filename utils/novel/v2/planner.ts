import { renderPrompt, systemContract } from '../prompts';
import { contentWords, sharedDistinctivePhrasing } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import { storyNames } from './tracker';
import { describeShapes, repeatedStaging, sceneShape, type SceneShape, type StagingTolerance } from './shapes';
import { describeRelations, relationsFor } from './relationships';
import { bandsFor, describeProfile, profileOf, readRung } from './profile';
import { describeStateDigest } from './stateDigest';
import { DEFAULT_WORDS_PER_SCENE, describeWorn, scenesFor, type WornEntry } from './ledger';
import { stringList } from './normalize';
import { describeFreshPalette, freshConstraint } from './fresh';
import { plannerHandoff, writerHandoff } from './handoff';
import type { BookDesign, ChapterPlan, SceneHandoff, ScenePlan, StoryState, StyleContract } from './types';

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
  /** How long a scene runs in this book; the measured median once there is one. */
  wordsPerScene?: number;
  /** Premise givens still owed to the reader, as "id — what was given". */
  premiseOwed?: string[];
}

/** A map of short strings, whatever shape the model gave it. */
function stateMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => [key.trim(), typeof entry === 'string' ? entry.trim() : entry == null ? '' : String(entry)] as [string, string])
    .filter(([key, entry]) => key && entry));
}

/** What a scene plan commits to beyond its prose brief, read into shapes code can compare. */
export function sceneCommitments(scene: ScenePlan): Pick<ScenePlan, 'state_at_start' | 'state_at_end' | 'establishes' | 'pays_premise'> {
  return {
    state_at_start: stateMap(scene.state_at_start),
    state_at_end: stateMap(scene.state_at_end),
    establishes: stringList(scene.establishes),
    pays_premise: (Array.isArray(scene.pays_premise) ? scene.pays_premise : [])
      .filter(item => item && typeof item.id === 'string' && item.id.trim())
      .map(item => ({ id: item.id.trim(), action: typeof item.action === 'string' ? item.action.trim() : '' })),
  };
}

/** How many scenes this chapter holds, as the planner is told it. */
export function describeSceneRoom(chapterWords: number, rate: number): string {
  const scenes = scenesFor(chapterWords, rate);
  if (!scenes) return `No length is set for this chapter. A scene in this book runs to about ${rate} words.`;
  return `This chapter has about ${chapterWords} words, and a scene in this book runs to about ${rate} words whatever is asked of it: that is room for ${scenes} scene${scenes === 1 ? '' : 's'}. A plan with more is returned before any prose is written.`;
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
      ...sceneCommitments(scene as ScenePlan),
      // Optional: scenes planned before the fresh bank existed carry none.
      ...(typeof (scene as ScenePlan).fresh_constraint === 'string'
        ? { fresh_constraint: (scene as ScenePlan).fresh_constraint }
        : {}),
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
      intention_collisions: input.design.intention_collisions?.collisions.filter(collision =>
        entry?.event_ids?.includes(collision.event_id)),
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
    state_handoff: input.previousHandoff ? JSON.stringify(plannerHandoff(input.previousHandoff)) : '(no earlier accepted scene)',
    open_threads_and_ending_requirements: JSON.stringify({ open_threads: input.openThreads, ending_requirements: input.endingRequirements }),
    remaining_word_budget: String(input.remainingWords),
    plan_findings: input.findings || '(first attempt at this chapter)',
    fresh_constraint: describeFreshPalette(input.chapter),
    scene_room: describeSceneRoom(Number(entry?.target_words) || 0, input.wordsPerScene || DEFAULT_WORDS_PER_SCENE),
    premise_owed: (input.premiseOwed || []).length ? input.premiseOwed!.join('\n') : '(every premise given has been put on the page)',
  });
  // The chapter is planned by the editor's model, not the writer's. Everything
  // that went wrong in a measured chapter was already wrong in its plan — a
  // book closed in one scene and open in the next, a particular left for each
  // scene to invent — and the writer carried the plan out faithfully. A plan is
  // a few percent of a chapter's tokens and decides the rest of them; it is the
  // one place the stronger model's time is cheapest and worth most.
  const raw = await structuredResponse(prompt, system, llm,
    ['status', 'chapter', 'function', 'starting_situation', 'ending_change', 'mechanism', 'cost', 'pressure_rung', 'scenes', 'forward_dependencies', 'replan_reason'],
    parsed => parsed, { temperature: 0.3, maxTokens: 16384, route: 'validator', stage: 'chapter-plan' });
  const planned = validateChapterPlan(raw, input.chapter);
  // Length is the chapter's, shared among the scenes there are: the planner
  // does not set it.
  const share = Number(entry?.target_words) > 0 && planned.status === 'ready' && planned.scenes.length
    ? Math.max(300, Math.round(Number(entry!.target_words) / planned.scenes.length / 50) * 50)
    : 0;
  const validated = share ? { ...planned, scenes: planned.scenes.map(scene => ({ ...scene, target_words: share })) } : planned;
  // Every scene leaves the planner with a constraint: one the model chose from
  // the palette, or the deterministic card for the scene id when it chose none.
  return {
    ...validated,
    scenes: validated.scenes.map(scene => (
      typeof scene.fresh_constraint === 'string' && scene.fresh_constraint.trim()
        ? scene
        : { ...scene, fresh_constraint: freshConstraint(input.chapter, scene.id) }
    )),
  };
}

const SCENE_KEYS = ['id', 'pov_id', 'location', 'story_time', 'participants', 'initial_conditions',
  'function', 'participant_intentions', 'pressure_or_uncertainty', 'development', 'required_outcome',
  'flexible_elements', 'required_fact_refs', 'required_source_refs', 'setup_or_payoff',
  'transition_to_next', 'target_words', 'outcome_kind'];

export async function rebaseScenePlan(input: {
  design: BookDesign;
  scene: ScenePlan;
  handoff: SceneHandoff;
  openThreads: string[];
  /** Why the scene is being replanned: what was struck from it, or what it repeats. */
  reason?: string;
}, llm: NovelLLM): Promise<ScenePlan> {
  const system = systemContract();
  const prompt = renderPrompt('P03_SCENE_REBASE', {
    story_contract: JSON.stringify(input.design.contract),
    scene_plan: JSON.stringify(input.scene),
    state_handoff: JSON.stringify({ ...input.handoff, required_new_outcome: input.scene.required_outcome }),
    replan_reason: input.reason || '(the scene before it changed what this scene starts from)',
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
    { temperature: 0.2, maxTokens: 8192, route: 'validator', stage: 'scene-rebase' }) as ScenePlan;
  // The length was the chapter's to share and is not the replan's to change.
  const settled = { ...raw, ...sceneCommitments(raw), target_words: input.scene.target_words };
  // The rebase is a causal correction, not a new deal: the scene keeps its
  // constraint unless the correction made it impossible to spend.
  if ((typeof raw.fresh_constraint !== 'string' || !raw.fresh_constraint.trim())
    && typeof input.scene.fresh_constraint === 'string' && input.scene.fresh_constraint.trim()) {
    return { ...settled, fresh_constraint: input.scene.fresh_constraint };
  }
  return settled;
}

export interface SceneContext {
  scene: ScenePlan;
  vars: Record<string, string>;
  /** Structural doubts for the model review, not verdicts: code detects, P02 disposes. */
  problems: ReadinessProblem[];
}

export interface ReadinessProblem {
  code: 'pov-absent' | 'empty-task' | 'location-mismatch' | 'missing-fact' | 'missing-source' | 'repeated-staging' | 'restaging-suspect' | 'retelling-suspect' | 'clash-suspect' | 'static-outcome' | 'unknown-participant' | 'seam-change';
  detail: string;
}

/**
 * Which doubts need a reader, and what the rest say to the writer directly.
 *
 * Every doubt code raised used to go to the editor: one review per scene, the
 * scene plan and the whole state digest in, a page of verdicts out. It was
 * meant to be rare and ran before eight scenes of nine, the most expensive
 * stage of a measured run — and nearly every doubt it was asked about was one
 * with a single right answer that needed no reading. A character recorded in
 * the corridor in a scene set in the lobby is not a question; it is an
 * instruction to show the walk.
 *
 * So a doubt whose answer is the same whoever reads it becomes the writer's
 * requirement as it stands. Three are left for the editor, because they are
 * about meaning: a participant who is no cast member has to be mapped to one
 * or refused, a scene with no task has to be given one, and a clash the NLI
 * head reports between the plan and memory has to be read before it is
 * believed; and a scene that opens somewhere other than where the last one
 * closed, saying what changed, has to be read for whether that could have
 * happened in between. The clash was learned the hard way: handed straight to the
 * writer, the head's suspicions arrived thirty-six and forty-four to a scene,
 * nearly all of them a plan sentence and a fact that merely share a subject.
 */
export function needsReading(problem: ReadinessProblem): boolean {
  return problem.code === 'unknown-participant' || problem.code === 'empty-task' || problem.code === 'clash-suspect' || problem.code === 'seam-change';
}

/** How many of a scene's NLI clashes are worth a reader's time: the strongest few. A judgement. */
export const MAX_CLASHES_READ = 4;

/**
 * The doubts worth reading out of everything raised: all that concern the cast
 * or the task, and of the clashes only the ones the head was surest of.
 */
export function doubtsToRead(problems: ReadinessProblem[]): ReadinessProblem[] {
  const score = (problem: ReadinessProblem): number => Number(/\(contradiction ([\d.]+)\)/.exec(problem.detail)?.[1]) || 0;
  const clashes = problems.filter(problem => problem.code === 'clash-suspect')
    .sort((first, second) => score(second) - score(first)).slice(0, MAX_CLASHES_READ);
  return [...problems.filter(problem => needsReading(problem) && problem.code !== 'clash-suspect'), ...clashes];
}

const WRITER_NOTES: Partial<Record<ReadinessProblem['code'], string>> = {
  'pov-absent': 'Write the scene with the point-of-view character present in it, or keep strictly to what that character could know of it.',
  'location-mismatch': 'Open by showing how they came to be here — a line or two is enough — or begin with them arriving.',
  'missing-fact': 'Do not write these as already established. If the scene needs one, it is established here, on the page.',
  'missing-source': 'Write the scene without leaning on that earlier passage; do not quote or reconstruct it from memory.',
  'repeated-staging': 'Who is here and where cannot change now: give this turn a pressure, an object or an outcome the scenes before it did not have.',
  'restaging-suspect': 'Do not stage that passage again. If this scene comes near it, it goes somewhere that one did not.',
  'retelling-suspect': 'Carry the outcome through something done, found, lost or decided in this scene, not by saying again what is known.',
  'static-outcome': 'End with someone\'s position, possession, knowledge or commitment held differently than at the start.',
};

/** A doubt code can settle, as the instruction the writer is given. */
export function writerRequirement(problem: ReadinessProblem): string {
  return `${problem.detail} ${WRITER_NOTES[problem.code] || ''}`.trim();
}

/**
 * The doubts about a scene plan that need a reader, found from the plan alone
 * so a whole chapter's can be asked about at once, before its first scene.
 */
export function planReadingProblems(design: BookDesign, scene: ScenePlan): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  if (!scene.required_outcome?.trim() && !scene.function?.trim()) {
    problems.push({ code: 'empty-task', detail: 'The scene states neither a required outcome nor a function.' });
  }
  const known = new Set(design.characters.map(character => character.id));
  for (const entry of scene.participants || []) {
    const token = entry.trim().toLowerCase().replace(/['’]s\b/g, '').replace(/['’]$/, '');
    const exact = known.has(entry)
      || design.characters.some(character => character.name.trim().toLowerCase().replace(/['’]s\b/g, '').replace(/['’]$/, '') === token);
    if (!exact) {
      problems.push({
        code: 'unknown-participant',
        detail: `Scene ${scene.id} lists "${entry}", which is no character id. Map it to the cast roster in the review ("${entry}" is which cast member, by id), or return major with how the scene carries the beat without inventing a person.`,
      });
    }
  }
  return problems;
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
  // Retelling sniff: the outcome restates what finished prose already proved.
  // Short outcomes are not judged — only a substantive outcome whose content
  // words almost all appear in the latest finished chapter, adding two words
  // or fewer of its own. The model review disposes it; code only brings it.
  const retelling = retellingSuspect(scene, priorChapters);
  if (retelling) problems.push({ code: 'retelling-suspect', detail: retelling });
  return problems;
}

/**
 * Does this scene's required outcome retell the latest finished prose rather
 * than advance past it? Content-word overlap with almost nothing new: an
 * outcome that says again what the reader already read is stalling, however
 * different its setup sounds. Empty history and short outcomes never qualify.
 */
export function retellingSuspect(scene: ScenePlan, priorChapters: PriorChapter[]): string {
  if (!priorChapters.length) return '';
  const outcome = (scene.required_outcome || '').trim();
  const words = contentWords(outcome);
  if (words.length < 4) return '';
  const last = priorChapters[priorChapters.length - 1];
  if (!last.text.trim()) return '';
  const prior = new Set(contentWords(last.text));
  const novel = words.filter(word => !prior.has(word));
  if (words.length - novel.length >= Math.ceil(words.length * 0.7) && novel.length <= 2) {
    return `Scene ${scene.id} retells ${last.ref} instead of advancing past it: "${outcome}" adds nothing its reader has not already read — resolve it through action, discovery, loss, or commitment on the page, or replan the outcome.`;
  }
  return '';
}

function sceneContains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** The chapter a scene id belongs to (CH02_S01 → 2); 1 when unparseable. */
export function chapterOfScene(sceneId: string): number {
  const chapter = Number(/CH(\d+)/i.exec(sceneId || '')?.[1]);
  return Number.isFinite(chapter) && chapter > 0 ? chapter : 1;
}

/** Whether a scene plan names what a fact is about: the subject's own words, all of them, in the plan. */
export function namesSubject(planText: string, subject: string): boolean {
  const words = subject.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(word => word.length >= 3 && !['the', 'and'].includes(word));
  return words.length > 0 && words.every(word => planText.includes(word));
}

/**
 * The voice corridor: the book's own style contract compressed to one
 * directive line. The writer already receives the full contract; this is the
 * corridor it must not leave — short enough to hold for the whole scene.
 */
export function voiceBrief(style: StyleContract): string {
  const parts = [
    style?.narrative_distance?.trim() && `Distance: ${style.narrative_distance.trim()}`,
    style?.attention?.trim() && `Attention: ${style.attention.trim()}`,
    style?.register?.trim() && `Register: ${style.register.trim()}`,
    style?.humor?.trim() && `Humor: ${style.humor.trim()}`,
    style?.emotional_expression?.trim() && `Feeling: ${style.emotional_expression.trim()}`,
  ].filter(Boolean);
  if (!parts.length) return '(no style contract recorded — hold a steady close third)';
  return `${parts.join('; ')}. Hold this voice for the whole scene: every line in its distance, its attention, its register.`;
}

/**
 * The scene corridor: what this scene must do on the page, in five lines
 * rather than a JSON dump. The full plan still travels as {{scene_plan}};
 * this is the brief the writer checks each paragraph against.
 */
export function sceneBrief(scene: ScenePlan): string {
  const lines = [
    `Scene ${scene.id}${scene.location?.trim() ? ` — ${scene.location.trim()}` : ''}${scene.story_time?.trim() ? `, ${scene.story_time.trim()}` : ''}.`,
    scene.function?.trim() ? `Function: ${scene.function.trim()}` : '',
    Object.keys(scene.state_at_start || {}).length
      ? `Opens with: ${Object.entries(scene.state_at_start!).map(([key, value]) => `${key} — ${value}`).join('; ')}`
      : '',
    scene.required_outcome?.trim() ? `Must end: ${scene.required_outcome.trim()}` : '',
    Object.keys(scene.state_at_end || {}).length
      ? `Closes with: ${Object.entries(scene.state_at_end!).map(([key, value]) => `${key} — ${value}`).join('; ')}. The next scene opens from exactly this.`
      : '',
    (scene.establishes || []).length
      ? `Fixes these particulars, as given — and fixes no other number, date, name or place the story would later lean on:\n${scene.establishes!.map(item => `  - ${item}`).join('\n')}`
      : '',
    (scene.pays_premise || []).length
      ? `Owed from the premise, to be put on the page here: ${scene.pays_premise!.map(item => item.action || item.id).join('; ')}`
      : '',
    (scene.participant_intentions || []).length
      ? `Wants: ${scene.participant_intentions.map(item => `${item.character_id} — ${item.intention}${item.reason_now ? ` (${item.reason_now})` : ''}`).join('; ')}`
      : '',
    scene.pressure_or_uncertainty?.trim() ? `Pressure: ${scene.pressure_or_uncertainty.trim()}` : '',
  ].filter(Boolean);
  return lines.join('\n') || '(no scene brief recorded)';
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
  // The facts the plan cites, and every fact about something the plan names:
  // a scene set in a room is given what the book has fixed about that room,
  // whether or not the planner thought to cite it. The writer cannot keep to
  // a floor, a colour or a trade it was never shown.
  const sceneText = `${JSON.stringify(scene)} ${(scene.participants || []).map(id => known.get(id)?.name || '').join(' ')}`.toLowerCase();
  const relevantFacts = state.facts.filter(f => (scene.required_fact_refs || []).includes(f.id)
    || (f.subject && namesSubject(sceneText, f.subject)));
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
      voice_brief: voiceBrief(design.style_contract),
      scene_brief: sceneBrief(scene),
      fresh_constraint: (typeof scene.fresh_constraint === 'string' && scene.fresh_constraint.trim())
        ? scene.fresh_constraint
        : freshConstraint(chapterOfScene(scene.id), scene.id),
      scene_plan: JSON.stringify(scene),
      scene_start_state: JSON.stringify({
        location: scene.location,
        story_time: scene.story_time,
        participants: scene.participants,
        initial_conditions: scene.initial_conditions,
      }),
      state_handoff: handoff
        ? JSON.stringify(writerHandoff({ ...handoff, required_new_outcome: scene.required_outcome }, scene.participants || [], design.characters.map(character => character.id)))
        : '(no earlier accepted scene)',
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
