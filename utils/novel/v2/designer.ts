import { DESIGN_SCHEMA } from './designSchema';
import { renderPrompt, systemContract } from '../prompts';
import { contentWords, extractPremiseNames } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import { matchKey, stringList } from './normalize';
import { castWords, takenUp } from './planGate';
import { bandsFor, curveProblems, profileOf, profileProblems, readProfile, readRung, type BudgetGap } from './profile';
import type { BookDesign, ProjectInput } from './types';

/**
 * Premise names the design answers to nothing. Code cannot tell a name from
 * a capitalized common noun ("Hope", "Winter"), so it never judges — the P01
 * model declares premise_names, and code additionally trusts two structural
 * signals: a multi-word span is never a stray noun, and a span the premise
 * repeats is load-bearing. A qualifying name must then occur somewhere in
 * the finished design — a character under that name, a world rule, an
 * explicit decision. Substring match on purpose: "keeper" in the rules
 * a common noun in the rules satisfies that noun, but nothing satisfies a
 * proper name except the name itself.
 * A premise-given "someone" names nobody and binds nothing.
 */
export function premiseNameGaps(design: BookDesign, premise: string): string[] {
  const declared = new Set(
    (Array.isArray(design.contract?.premise_names) ? design.contract.premise_names : [])
      .filter(item => typeof item === 'string')
      .map(item => item.toLowerCase()),
  );
  // The contract's own lists are excluded from the search — declaring a name
  // is not casting it, same as for premise givens below. An inferred decision
  // recorded in the contract still counts as an explicit answer.
  const { premise_names: _names, premise_givens: _givens, ...restContract } = design.contract ?? {};
  const { planning_history: _history, ...construction } = design;
  const haystack = JSON.stringify({ ...construction, contract: restContract }).toLowerCase();
  return extractPremiseNames(premise)
    .filter(name => {
      if (name.includes(' ')) return true;
      if (declared.has(name.toLowerCase())) return true;
      return premise.split(name).length - 1 >= 2;
    })
    .filter(name => !haystack.includes(name.toLowerCase()));
}

/**
 * Premise givens the construction never places: concrete premise elements
 * (a burning warehouse, a donation check) with no home in the cast, rules,
 * causal map, ending, or chapter map. The contract's own list is excluded
 * from the search — listing a given is not placing it. Match by content
 * word, not inflection: "warehouse" satisfies "burning warehouse".
 */
export function premiseGivenGaps(design: BookDesign): string[] {
  const givens = Array.isArray(design.contract?.premise_givens) ? design.contract.premise_givens : [];
  if (!givens.length) return [];
  const { characters, world_rules, causal_map, ending, chapter_map } = design;
  const haystack = JSON.stringify({ characters, world_rules, causal_map, ending, chapter_map }).toLowerCase();
  return givens
    .map(item => (typeof item?.given === 'string' ? item.given.trim() : ''))
    .filter((given, index, all) => given && all.indexOf(given) === index)
    .filter(given => {
      // Anchors widen as they get weaker, never narrow. Long content words are
      // the best evidence; when a given has none — a stated year, say, where
      // every content word is four characters — the fallback is the short words
      // themselves, not the whole phrase. Demanding the literal phrase is the
      // strictest test of all, and a construction never contains one: the charge
      // is blocking and fatal, so that fallback refused to produce any book whose
      // premise mentioned a year, a time, or any other short concrete given.
      const content = contentWords(given);
      const long = content.filter(word => word.length >= 5);
      const anchors = long.length ? long : content.length ? content : [given.toLowerCase()];
      // By the word's stem, not its inflection: a given that says "checked in"
      // is placed by a construction that says he "checks in", and a charge this
      // fatal must not turn on a tense. A run was refused outright for it.
      return !anchors.some(word => haystack.includes(word.length >= 6 ? word.replace(/(?:ing|ed|es|s)$/, '') : word));
    });
}

/**
 * The budgets the design allocated, checked before a chapter is planned.
 *
 * This is the cheapest possible place to catch the middle of a book going
 * circular, because nothing has been written yet: a ledger too short for the
 * chapter count means one solution in different scenery, chapters with no cost
 * mean a protagonist who never pays, and rungs that do not trace the declared
 * curve mean the profile bought nothing. Every finding is a sentence for the
 * designer, not a verdict — the review disposes them.
 */
/** The fewest keyed world rules a design may fix. A judgement: a floor plan, a period, each lead's trade, and the contents of what the story turns on. */
export const MIN_PARTICULARS = 8;

export function designBudgetGaps(design: BookDesign, chapterCount: number): BudgetGap[] {
  const profile = profileOf(design);
  const bands = bandsFor(profile);
  const gaps: BudgetGap[] = [...profileProblems(profile, chapterCount)];
  const chapters = Array.isArray(design.chapter_map) ? design.chapter_map : [];

  const ledger = new Map(profile.mechanism_ledger.map(item => [matchKey(item), item]));
  const spent = new Map<string, number[]>();
  const uncosted: number[] = [];
  for (const entry of chapters) {
    const cost = typeof entry.cost === 'string' ? entry.cost.trim() : '';
    if (!cost) uncosted.push(entry.chapter);
    const mechanism = typeof entry.mechanism === 'string' ? entry.mechanism.trim() : '';
    if (!mechanism) continue;
    const key = matchKey(mechanism);
    if (ledger.size && !ledger.has(key)) {
      gaps.push({ code: `mechanism-unknown:${entry.chapter}`, detail: `Chapter ${entry.chapter} meets the obstacle by "${mechanism}", which the mechanism ledger does not hold. Either add it to the ledger as a distinct way of meeting the obstacle, or draw the chapter's mechanism from what the ledger already offers.` });
      continue;
    }
    spent.set(key, [...(spent.get(key) || []), entry.chapter]);
  }
  if (uncosted.length) {
    gaps.push({ code: 'uncosted-chapters', detail: `Chapters ${uncosted.join(', ')} take nothing from anyone: no cost is declared. A chapter that costs nothing repeats the one before it however different its scenery, so state what each of these takes, in the terms of this book's cost_kinds (${profile.cost_kinds.join('; ') || 'none declared'}).` });
  }
  for (const [key, used] of spent) {
    if (used.length > bands.mechanismReuse) {
      gaps.push({ code: `mechanism-overspent:${key}`, detail: `"${ledger.get(key) || key}" carries ${used.length} chapters (${used.join(', ')}), past this book's allowance of ${bands.mechanismReuse}. Give the extra chapters a different way of meeting the obstacle, or declare mechanism_reuse honestly higher if repeating the method is this book's form.` });
    }
  }
  const rungs = chapters
    .slice()
    .sort((first, second) => first.chapter - second.chapter)
    .map(entry => readRung(entry.pressure_rung))
    .filter((rung): rung is number => rung !== null);
  if (rungs.length) {
    gaps.push(...curveProblems(profile.pressure_curve, rungs).map((detail, index) => ({ code: `curve:${index}`, detail })));
  } else if (chapters.length >= 3) {
    gaps.push({ code: 'no-rungs', detail: `No chapter takes a rung on the ${profile.pressure_curve} curve the profile declares. Without rungs the curve is a label, and nothing downstream can tell a book that builds from a book that repeats.` });
  }
  const collisions = design.intention_collisions?.collisions || [];
  const unplacedCollisions = collisions.filter(collision => !chapters.some(entry =>
    Array.isArray(entry.event_ids) && entry.event_ids.includes(collision.event_id)));
  if (unplacedCollisions.length) {
    gaps.push({ code: 'intention-unplaced', detail: `The tested choices ${unplacedCollisions.map(item => `${item.situation_id} (${item.event_id})`).join(', ')} have no chapter allocation. Place their causal events in chapter_map.event_ids so the scene planner receives their earned action-response chain and cost.` });
  }
  // What the ending needs, placed while there is still a whole book to place it
  // in. The plan gate already counts the ending's requirements against the
  // chapters left, and by the time it could object on a live run there was one
  // chapter left: it refused that chapter's plan three times for carrying more
  // than a chapter holds, and the chapter was written anyway, because by then
  // nothing else could be done. Allocation, not a threshold — each requirement
  // has to have a chapter before the last that prepares it.
  const unplaced = unplacedEndingRequirements(design);
  if (unplaced.length) {
    gaps.push({ code: 'ending-unplaced', detail: `The ending requires ${unplaced.map(item => `"${item}"`).join('; ')}, and no chapter before the last prepares ${unplaced.length > 1 ? 'them' : 'it'}. Say in chapter_map which chapter establishes each — in its function, main_change or setup_or_payoff — or the last chapter is left to set up the ending and deliver it in the same pages.` });
  }
  return [...gaps, ...designStructureGaps(design)];
}

/** Checks due before the structure is frozen, independent of future chapter budgets. */
export function designStructureGaps(design: Pick<BookDesign, 'world_rules' | 'causal_map'>): BudgetGap[] {
  const gaps: BudgetGap[] = [];
  // The world's particulars. A design that fixes none leaves the first scene
  // to mention a room to decide what floor it is on, and the next to decide
  // again. Counted, not judged. Asked for three, a measured design fixed exactly three
  // and its scenes disagreed about everything else.
  const keyed = (Array.isArray(design.world_rules) ? design.world_rules : [])
    .filter(rule => typeof rule?.subject === 'string' && rule.subject.trim() && typeof rule.attribute === 'string' && rule.attribute.trim());
  if (keyed.length < MIN_PARTICULARS) {
    gaps.push({ code: 'particulars-unfixed', detail: `world_rules fixes ${keyed.length} particular(s) with a subject and an attribute. Fix the ones the story stands on — the layout of the place, the period and its money and records, what each important person does for a living, what each document or object the story turns on says or holds — one rule each, at least ${MIN_PARTICULARS}, so that no scene has to decide them.` });
  }
  // A past left as a placeholder is a past each chapter invents for itself.
  const vague = (Array.isArray(design.causal_map) ? design.causal_map : [])
    .filter(event => event?.before_story === true && /\b(?:something|someone|somebody|a secret|an event|a specific event|some reason|unknown)\b/i.test(`${event.action_or_event} ${event.cause}`));
  if (vague.length) {
    gaps.push({ code: 'past-undecided', detail: `The past the story uncovers is left open in ${vague.map(event => event.id).join(', ')} ("${String(vague[0].action_or_event).slice(0, 120)}"). Say what happened — who did what, to whom, where, when and why — as fact.` });
  }
  return gaps;
}

/** The ending's requirements that no chapter before the last takes up. */
export function unplacedEndingRequirements(design: BookDesign): string[] {
  const before = (design.chapter_map || []).slice().sort((first, second) => first.chapter - second.chapter).slice(0, -1);
  if (!before.length) return [];
  const names = castWords(design);
  const map = JSON.stringify(before.map(entry => [entry.function, entry.main_change, entry.setup_or_payoff, entry.dependencies])).toLowerCase();
  return stringList(design.ending?.required_setup).filter(requirement => !takenUp(map, requirement, names));
}

/**
 * Every requirement of the ending, given a chapter before the last.
 *
 * The designer is asked to place them and the review is told when it has not,
 * and on every measured book the last chapter still arrived holding more than
 * a chapter can prepare and deliver at once: its plan was refused for it, three
 * times, and written anyway. A remark can be outlived. So what the designer
 * leaves unplaced after its fix rounds is placed by code — dealt across the
 * chapters before the last, latest first, into `setup_or_payoff`, where the
 * chapter's planner reads it as part of what the chapter is for. Which chapter
 * is arithmetic; that it happens before the last one is the point.
 */
export function placeEndingRequirements(design: BookDesign): BookDesign {
  const unplaced = unplacedEndingRequirements(design);
  const ordered = design.chapter_map.slice().sort((first, second) => first.chapter - second.chapter);
  const targets = ordered.slice(0, -1).reverse();
  if (!unplaced.length || !targets.length) return design;
  const added = new Map<number, string[]>();
  unplaced.forEach((requirement, index) => {
    const chapter = targets[index % targets.length].chapter;
    added.set(chapter, [...(added.get(chapter) || []), `Setup the ending requires, to be established in this chapter: ${requirement}`]);
  });
  return {
    ...design,
    chapter_map: design.chapter_map.map(entry => (added.has(entry.chapter)
      ? { ...entry, setup_or_payoff: [...stringList(entry.setup_or_payoff), ...added.get(entry.chapter)!] }
      : entry)),
  };
}

/**
 * BookDesigner: successive levels turn the premise into a writable book design.
 * The design is validated structurally before anything downstream may read it —
 * chapter_map length, unique ids, present sections — and rejected otherwise, so a
 * malformed design fails here instead of corrupting ten chapters.
 */
export function validateBookDesign(raw: unknown, chapterCount: number): BookDesign {
  if (!raw || typeof raw !== 'object') throw new Error('Book design is not an object.');
  const design = raw as Record<string, unknown>;
  for (const key of ['contract', 'profile', 'dramatic_core', 'style_contract', 'characters', 'world_rules', 'causal_map', 'ending', 'chapter_map']) {
    if (design[key] === undefined) throw new Error(`Book design is missing "${key}".`);
  }
  // The profile decides what every check downstream measures against. A design
  // that answers it with a string or a list has not declared what kind of book
  // this is, and nothing later can tell the difference between that and a book
  // whose form simply happens to sit in the middle of every band.
  if (!design.profile || typeof design.profile !== 'object' || Array.isArray(design.profile)) {
    throw new Error('Book design carries no profile object: the pressure curve, the cost kinds and the mechanism ledger are what the rest of the pipeline checks against.');
  }
  const chapters = design.chapter_map as { chapter?: unknown }[];
  if (!Array.isArray(chapters) || chapters.length !== chapterCount) {
    throw new Error(`chapter_map holds ${Array.isArray(chapters) ? chapters.length : 'no'} entries for ${chapterCount} chapters.`);
  }
  const ids = new Set<string>();
  for (const list of [design.characters, design.world_rules, design.causal_map] as { id?: unknown }[][]) {
    if (!Array.isArray(list)) throw new Error('Book design lists must be arrays.');
    for (const entry of list) {
      if (typeof entry?.id !== 'string' || !entry.id) throw new Error('Design entries need stable string ids.');
      if (ids.has(entry.id)) throw new Error(`Duplicate design id: ${entry.id}.`);
      ids.add(entry.id);
    }
  }
  const chapterNumbers = chapters.map(entry => entry.chapter);
  if (new Set(chapterNumbers).size !== chapterCount || chapterNumbers.some(value =>
      !Number.isInteger(value) || Number(value) < 1 || Number(value) > chapterCount)) {
    throw new Error('chapter_map must contain each chapter number exactly once.');
  }
  // Normalized, not defaulted: a chapter that declared no cost keeps an empty
  // cost and a null rung, which the budget check reads as a refusal and reports.
  // Filling them in would hide the one thing worth seeing.
  const design_ = raw as BookDesign;
  return {
    ...design_,
    contract: { ...design_.contract, working_title: typeof design_.contract?.working_title === 'string' ? design_.contract.working_title : '' },
    profile: readProfile(design_.profile),
    chapter_map: design_.chapter_map.map(entry => ({
      ...entry,
      mechanism: typeof entry.mechanism === 'string' ? entry.mechanism : '',
      cost: typeof entry.cost === 'string' ? entry.cost : '',
      pressure_rung: readRung(entry.pressure_rung),
    })),
  };
}

export type DesignLevel = 'concept' | 'structure' | 'chapters';
export const DESIGN_LEVELS = ['concept', 'structure', 'chapters'] as const;
export const LEVEL_KEYS = {
  concept: ['contract', 'dramatic_core', 'style_contract', 'ending'],
  structure: ['characters', 'world_rules', 'causal_map'],
  chapters: ['profile', 'chapter_map'],
} as const;
export type DesignDraft = Partial<BookDesign>;

const LEVEL_TASKS: Record<DesignLevel, string> = {
  concept: 'Short plan for the WHOLE book: the distinctive situation, central conflict, stakes, why now, causal progression in sources_of_development, decisive ending and its prerequisites. Name the main people in this short synopsis. No chapter map or detailed scenes yet.',
  structure: 'Crystallize the approved short plan into cast, motives, causal events (including the settled past), and keyed world particulars. Explain each planted oddity. Account for knowledge, means, dates, amounts and document contents. Do not change the ending or central conflict. Each causal event must describe how independent goals and informed choices produce its consequence, including credible responses by people whose interests are threatened.',
  chapters: 'Crystallize the approved structure into a profile and exactly the requested number of chapters. Allocate causal events, discoveries, costs, varied mechanisms and ending prerequisites. Each chapter must develop the book rather than repeat it. Use intention_collisions in the approved structure: develop the consequences of these independent choices across chapters. Preserve the causal mechanism and costs that made an outcome possible. Leave scene choreography for P03.',
};

/** Extra returned sections never enter the draft: ownership is enforced by code. */
export function readDesignLayer(raw: unknown, level: DesignLevel): DesignDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${level} layer.`);
  const source = raw as Record<string, unknown>;
  const layer: Record<string, unknown> = {};
  for (const key of LEVEL_KEYS[level]) {
    const value = source[key];
    const example = DESIGN_SCHEMA[key];
    if (!value || typeof value !== 'object' || Array.isArray(value) !== Array.isArray(example)) {
      throw new Error(`${level} layer is missing or malformed: ${key}.`);
    }
    if (!Array.isArray(example)) {
      for (const field of Object.keys(example)) {
        if (!(field in value)) throw new Error(`${key} is missing ${field}.`);
      }
    }
    layer[key] = value;
  }
  if (level === 'structure') {
    const ids = new Set<string>();
    for (const key of LEVEL_KEYS.structure) {
      for (const entry of layer[key] as { id?: unknown }[]) {
        if (typeof entry?.id !== 'string' || !entry.id.trim() || ids.has(entry.id)) {
          throw new Error(`Invalid or duplicate structure id in ${key}.`);
        }
        ids.add(entry.id);
      }
    }
    const cast = new Set((layer.characters as BookDesign['characters']).map(entry => entry.id));
    if (!cast.size) throw new Error('Structure needs a cast.');
    for (const event of layer.causal_map as BookDesign['causal_map']) {
      if (event.actor_id && !cast.has(event.actor_id)) throw new Error(`Unknown causal actor: ${event.actor_id}.`);
    }
  }
  return layer as DesignDraft;
}

export async function designLayer(input: ProjectInput, level: DesignLevel, approved: DesignDraft,
  previous: DesignDraft, findings: string, llm: NovelLLM): Promise<DesignDraft> {
  const prompt = renderPrompt('P01_BOOK_DESIGN', {
    premise: input.premise, genre: input.genre, chapter_count: String(input.chapter_count),
    target_total_words: String(input.target_total_words), author_requirements: input.author_requirements || '(none)',
    level_task: LEVEL_TASKS[level], approved_plan: JSON.stringify(approved),
    previous_layer: JSON.stringify(previous), review_issues: findings || '(first version)',
    output_schema: JSON.stringify(Object.fromEntries(LEVEL_KEYS[level].map(key => [key, DESIGN_SCHEMA[key]])), null, 2),
  });
  return structuredResponse(prompt, systemContract(), llm, [...LEVEL_KEYS[level]],
    raw => {
      const layer = readDesignLayer(raw, level);
      if (level === 'chapters') validateBookDesign({ ...approved, ...layer }, input.chapter_count);
      return layer;
    },
    { temperature: 0.4, maxTokens: 16384, route: 'validator', stage: findings ? `design-refine-${level}` : `design-${level}`, deliberate: true });
}

export async function conceptCandidates(input: ProjectInput, llm: NovelLLM): Promise<DesignDraft[]> {
  const prompt = renderPrompt('P01_BOOK_DESIGN', {
    premise: input.premise, genre: input.genre, chapter_count: String(input.chapter_count),
    target_total_words: String(input.target_total_words), author_requirements: input.author_requirements || '(none)',
    level_task: `${LEVEL_TASKS.concept} Generate exactly THREE substantially different candidate short plans. Change the causal explanation and decisive choice, not just names or scenery. One must challenge the most obvious reading of the premise.`,
    approved_plan: '{}', previous_layer: '{}', review_issues: '(first version)',
    output_schema: JSON.stringify({ candidates: Array.from({ length: 3 }, () => Object.fromEntries(LEVEL_KEYS.concept.map(key => [key, DESIGN_SCHEMA[key]]))) }, null, 2),
  });
  return structuredResponse(prompt, systemContract(), llm, ['candidates'], raw => {
    if (!Array.isArray(raw.candidates) || raw.candidates.length !== 3) throw new Error('Expected three concept candidates.');
    const candidates = raw.candidates.map((item: unknown) => readDesignLayer(item, 'concept'));
    if (new Set(candidates.map((item: DesignDraft) => JSON.stringify([item.dramatic_core, item.ending]))).size !== 3) {
      throw new Error('Concept candidates repeat the same conflict and ending.');
    }
    return candidates;
  }, { temperature: 0.8, maxTokens: 16384, route: 'validator', stage: 'design', deliberate: true });
}

export async function selectConcept(input: ProjectInput, candidates: DesignDraft[], llm: NovelLLM) {
  return structuredResponse(renderPrompt('P01_CONCEPT_SELECT', {
    request: JSON.stringify(input), candidates: JSON.stringify(candidates),
  }), systemContract(), llm, ['candidate_index', 'comparisons', 'reason'], raw => {
    if (!Number.isInteger(raw.candidate_index) || !candidates[raw.candidate_index] ||
        typeof raw.reason !== 'string' || !raw.reason.trim() || !Array.isArray(raw.comparisons) ||
        raw.comparisons.length !== candidates.length ||
        new Set(raw.comparisons.map((item: any) => item.candidate_index)).size !== candidates.length ||
        raw.comparisons.some((item: any) => !Number.isInteger(item.candidate_index) || !candidates[item.candidate_index] ||
          typeof item.strengths !== 'string' || !item.strengths.trim() || typeof item.weaknesses !== 'string' || !item.weaknesses.trim())) {
      throw new Error('Concept selection requires a valid index and comparison of every candidate.');
    }
    return raw as { candidate_index: number; comparisons: { candidate_index: number; strengths: string; weaknesses: string }[]; reason: string };
  }, { temperature: 0.1, maxTokens: 4096, route: 'validator', stage: 'design-selection', deliberate: true });
}

/** Unreviewed assembly for callers that only need a draft; production uses designReviewedBook. */
export async function designBook(input: ProjectInput, llm: NovelLLM): Promise<BookDesign> {
  const candidates = await conceptCandidates(input, llm);
  const selected = await selectConcept(input, candidates, llm);
  let draft = candidates[selected.candidate_index];
  for (const level of ['structure', 'chapters'] as const) {
    draft = { ...draft, ...await designLayer(input, level, draft, {}, '', llm) };
  }
  return validateBookDesign(draft, input.chapter_count);
}
