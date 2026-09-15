import { renderPrompt, systemContract } from '../prompts';
import { contentWords, extractPremiseNames } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import { matchKey } from './normalize';
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
  const haystack = JSON.stringify({ ...design, contract: restContract }).toLowerCase();
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
      return !anchors.some(word => haystack.includes(word));
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
  return gaps;
}

/**
 * BookDesigner: one call turns the premise into a compact, writable book design.
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

export async function designBook(input: ProjectInput, llm: NovelLLM): Promise<BookDesign> {
  const system = systemContract();
  const prompt = renderPrompt('P01_BOOK_DESIGN', {
    premise: input.premise,
    genre: input.genre,
    chapter_count: String(input.chapter_count),
    target_total_words: String(input.target_total_words),
    author_requirements: input.author_requirements || '(none)',
  });
  const raw = await structuredResponse(
    prompt, system, llm,
    ['contract', 'profile', 'dramatic_core', 'style_contract', 'characters', 'world_rules', 'causal_map', 'ending', 'chapter_map'],
    parsed => parsed,
    { temperature: 0.4, maxTokens: 16384, route: 'writer' }
  );
  return validateBookDesign(raw, input.chapter_count);
}
