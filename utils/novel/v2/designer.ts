import { renderPrompt, systemContract } from '../prompts';
import { contentWords, extractPremiseNames } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import type { BookDesign, ProjectInput } from './types';

/**
 * Premise names the design answers to nothing. Code cannot tell a name from
 * a capitalized common noun ("Hope", "Winter"), so it never judges — the P01
 * model declares premise_names, and code additionally trusts two structural
 * signals: a multi-word span is never a stray noun, and a span the premise
 * repeats is load-bearing. A qualifying name must then occur somewhere in
 * the finished design — a character under that name, a world rule, an
 * explicit decision. Substring match on purpose: "keeper" in the rules
 * satisfies "keeper", but nothing satisfies "Pax" except Pax.
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
      const words = contentWords(given).filter(word => word.length >= 5);
      const anchors = words.length ? words : [given.toLowerCase()];
      return !anchors.some(word => haystack.includes(word));
    });
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
  for (const key of ['contract', 'dramatic_core', 'style_contract', 'characters', 'world_rules', 'causal_map', 'ending', 'chapter_map']) {
    if (design[key] === undefined) throw new Error(`Book design is missing "${key}".`);
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
  return raw as BookDesign;
}

export async function designBook(input: ProjectInput, llm: NovelLLM): Promise<BookDesign> {
  const system = systemContract({ story_language: input.story_language, planning_language: input.planning_language });
  const prompt = renderPrompt('P01_BOOK_DESIGN', {
    premise: input.premise,
    genre: input.genre,
    chapter_count: String(input.chapter_count),
    target_total_words: String(input.target_total_words),
    author_requirements: input.author_requirements || '(none)',
  });
  const raw = await structuredResponse(
    prompt, system, llm,
    ['contract', 'dramatic_core', 'style_contract', 'characters', 'world_rules', 'causal_map', 'ending', 'chapter_map'],
    parsed => parsed,
    { temperature: 0.4, maxTokens: 16384, route: 'writer' }
  );
  return validateBookDesign(raw, input.chapter_count);
}
