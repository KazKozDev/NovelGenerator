/**
 * Diversity, originality and bestseller helpers for the novel pipeline.
 *
 * All prompt blocks are English-only by design: the story language is carried
 * by the author contract (BookSpec.language, default English), while every
 * instruction, repair note and review criterion stays in English so the
 * validator can check it deterministically.
 */

/** Sampling temperatures separated by role: planners invent, writers vary, validators judge. */
export const SAMPLING = {
  outline: 0.9,
  blueprint: 0.85,
  chapterPlan: 0.85,
  chapterPlanRetry: 0.95,
  speechReplan: 0.85,
  prose: 0.8,
  proseCorrection: 0.9,
  repair: 0.4,
  validator: 0.15,
} as const;

/**
 * The dramatic structures a scene may take, and the only values sceneShape accepts.
 *
 * One list, because there were two: this constant used to hold genre set pieces (heist, trial, road)
 * while the chapter planner was given a different list of dramatic structures, and the seed below
 * then told the planner to prefer a value its own instructions forbade. Five of the eight seeds were
 * unusable, and nothing checked the answer either way.
 *
 * These are shapes a scene can actually have, quiet scenes included: preparation, aftermath and
 * reflection are here so that a scene which changes an intention rather than a situation has a true
 * label and is not pushed into calling itself a confrontation.
 */
export const SCENE_SHAPES = [
  'confrontation',
  'negotiation',
  'investigation',
  'discovery',
  'confession',
  'pursuit',
  'escape',
  'preparation',
  'aftermath',
  'reflection',
] as const;
export type SceneShape = (typeof SCENE_SHAPES)[number];

/**
 * Near misses a planner returns for a shape it means, and the older set-piece names kept in saved
 * plans. Mapping them is not leniency about the vocabulary: it is refusing to throw away a correct
 * plan over a synonym, while still rejecting a label that names no structure at all.
 */
const SHAPE_ALIASES: Record<string, SceneShape> = {
  chase: 'pursuit', hunt: 'pursuit', flight: 'pursuit', manhunt: 'pursuit',
  interrogation: 'investigation', questioning: 'investigation', inquiry: 'investigation', search: 'investigation',
  revelation: 'discovery', reveal: 'discovery', realization: 'discovery',
  argument: 'confrontation', standoff: 'confrontation', clash: 'confrontation', duel: 'confrontation', trial: 'confrontation',
  bargain: 'negotiation', bargaining: 'negotiation', deal: 'negotiation', persuasion: 'negotiation',
  admission: 'confession', disclosure: 'confession',
  breakout: 'escape', getaway: 'escape',
  planning: 'preparation', setup: 'preparation', heist: 'preparation', rehearsal: 'preparation', infiltration: 'preparation',
  fallout: 'aftermath', regrouping: 'aftermath', recovery: 'aftermath', road: 'aftermath',
  rest: 'reflection', contemplation: 'reflection', solitude: 'reflection',
};

/** The shape this label names, or null when it names none. */
export function normalizeSceneShape(value: string): SceneShape | null {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const match = SCENE_SHAPES.find(shape => shape === key);
  if (match) return match;
  return SHAPE_ALIASES[key] || null;
}

/**
 * The registers a scene can move the story in. A scene declares which one it shifts and from what to
 * what, and the shift is checked against the written prose afterwards; a scene that shifts nothing is
 * a scene the book does not need.
 */
export const SHIFT_REGISTERS = ['knowledge', 'resource', 'relationship', 'initiative', 'position'] as const;
export type ShiftRegister = (typeof SHIFT_REGISTERS)[number];

/**
 * How a scene's attempt ends. 'clean' is the one that makes a chapter stand still, so a plan is
 * allowed at most one of them: a scene whose attempt succeeds at no cost hands the next scene nothing
 * to start from.
 */
export const OUTCOME_TYPES = ['costly-success', 'setback', 'clean'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/**
 * The craft constraints a chapter is planned under, rotated so consecutive chapters do not reach for
 * the same move.
 *
 * There used to be four cards: a genre mix, a setting, a hard constraint and a ban. Only the scene
 * shape ever reached a prompt — the function that assembled the rest into a sentence was written,
 * tested, and called by nothing, so for the life of this project a plan was seeded by a value it was
 * told to "prefer if it fits". The genre mix and the setting card are not restored with the others:
 * a book bound to an approved outline cannot be handed "horror + workplace comedy" and a night market
 * in a blackout, and a seed that fights the outline is worse than no seed. What is restored is the
 * half that is craft rather than content — a constraint that costs the plan something, and a ban on
 * the move every model reaches for first.
 */
export const CONSTRAINT_CARDS = [
  'no prophecy may explain anything',
  'no character may wake up to start a scene',
  'no magic or technology may resolve the climax for free',
  'every plan must cost its maker something irreversible',
  'the antagonist must have a credible, humane motive',
  'one established fact must be proven false on the page',
] as const;

export const BAN_CARDS = [
  'no tavern gathering, no council explaining the world',
  'no mirror description, no weather opening',
  'no dream that turns out to be just a dream',
  'no villain monologue explaining the whole plot',
] as const;

export interface IdeaSeed {
  constraint: string;
  ban: string;
  sceneShape: SceneShape;
}

/** Deterministic seed picker (index-based) so plans are reproducible and testable. */
export function buildIdeaSeed(index: number): IdeaSeed {
  const at = (list: readonly string[], offset: number): string =>
    list[((index + offset) % list.length + list.length) % list.length];
  return {
    constraint: at(CONSTRAINT_CARDS, 2),
    ban: at(BAN_CARDS, 3),
    sceneShape: SCENE_SHAPES[((index % SCENE_SHAPES.length) + SCENE_SHAPES.length) % SCENE_SHAPES.length],
  };
}

export function ideaSeedPrompt(seed: IdeaSeed): string {
  return `BINDING CONSTRAINTS FOR THIS CHAPTER: ${seed.constraint}; ${seed.ban}. They constrain how the approved events are planned, never which events happen: where a constraint and the approved outline disagree, the outline stands and the constraint applies to everything else.`;
}

/** Structural bans shared by planners and the scene writer. */
export const STRUCTURE_BANS = `ORIGINALITY RULES (binding, not suggestions):
- Do not open a scene with waking up, weather, a mirror, or travel itinerary.
- Do not end two consecutive chapters with the same move (question-cliffhanger, rest-and-talk, sudden arrival).
- Do not reuse the previous chapter's sequence of actions, images and conclusions with new synonyms.
- Each scene gets one distinct shape (chase, confession, heist, trial, road, interrogation, negotiation, escape); name it in the plan.
- A motif may recur only with a changed meaning or consequence.`;

/** Commercial-fiction requirements the validator can check mechanically. */
export const BESTSELLER_REQUIREMENTS = `BESTSELLER CHECK (the validator rejects without these):
- The stake of the scene is named within the first 300 words through action, conflict or a question — never through exposition.
- The viewpoint character makes a choice with a price; they do not only observe.
- The final line pushes into the next scene; it does not summarize what the scene meant.`;

/** Language contract: story prose follows the requested language (default English); all meta output stays English. */
export function languageContract(language?: string): string {
  const story = (language || 'English').trim() || 'English';
  return `Write all story prose in ${story}. Write every plan, review, instruction and repair note in English. Never mix commentary into prose.`;
}

const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

function ngrams(words: string[], n: number): string[] {
  if (words.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= words.length - n; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

/** Share of unique n-grams (default 4-grams). Higher means less formulaic phrasing. */
export function uniqueNgramRatio(text: string, n = 4): number {
  const grams = ngrams(wordsOf(text), n);
  if (!grams.length) return 1;
  return new Set(grams).size / grams.length;
}

function vocabularySet(text: string): Set<string> {
  return new Set(wordsOf(text));
}


const HOOK_MARKERS =
  /(you|i must|we have until|deadline|threat|danger|kill|escape|run|choose|decide|secret|lie|truth|missing|stolen|dead|arrest|attack|fire|alarm|chase|knife|gun|trial|verdict|\?)/i;

/** Heuristic 0–10 score for whether the opening ~150 words hook through action, conflict or a question. */
export function hookScore(content: string): number {
  const opening = content.trim().split(/\s+/).slice(0, 150).join(' ');
  if (!opening) return 0;
  let score = 4;
  if (/^(the |a |an |it was |there was |in the )/i.test(opening)) score -= 1;
  if (HOOK_MARKERS.test(opening)) score += 3;
  if (/\?/.test(opening)) score += 1;
  if (/\b(said|shouted|whispered|asked|answered|replied)\b/i.test(opening)) score += 1;
  return Math.max(0, Math.min(10, score));
}

const RECAP_OPENERS =
  /^(in summary|in conclusion|as we have seen|the moral of|and so they (rested|talked|agreed)|they decided to rest)\b/i;

/** True when the chapter closes with a recap instead of a forward push. */
export function isRecapEnding(content: string): boolean {
  const paragraphs = content.trim().split(/\n\s*\n/).filter(Boolean);
  const last = (paragraphs.at(-1) || content.trim().split(/(?<=[.!?])\s+/).at(-1) || '').trim();
  return RECAP_OPENERS.test(last) || /summar(y|ize|ise) (what|everything|the (scene|chapter)).{0,80}$/i.test(last);
}

export interface AdvisoryFinding {
  id: 'weak-opening-hook' | 'recap-ending';
  detail: string;
}

/**
 * Bestseller surface check, advisory only by design.
 *
 * It is intentionally NOT wired into mechanicalIssues / acceptOrRepair:
 * those paths feed lineEdit, which turns any stored issue into a targeted
 * revision call. Advisory findings are for reports, dashboards and the
 * five pipeline metrics — they never block acceptance or trigger repairs.
 */
export function bestsellerAdvisory(content: string): AdvisoryFinding[] {
  if (!content.trim()) return [];
  const findings: AdvisoryFinding[] = [];
  if (hookScore(content) < 5) {
    findings.push({
      id: 'weak-opening-hook',
      detail: 'The opening ~150 words do not hook through action, conflict or a question.',
    });
  }
  if (isRecapEnding(content)) {
    findings.push({
      id: 'recap-ending',
      detail: 'The chapter closes with a summary of what the scene meant rather than a forward push.',
    });
  }
  return findings;
}
