import { fillTemplate } from '../prompts';
import stressRaw from '../../../prompts/THESIS_STRESS.md?raw';
import coverageRaw from '../../../prompts/THESIS_COVERAGE.md?raw';
import dryRunRaw from '../../../prompts/THESIS_DRYRUN.md?raw';
import { wholeBookPlan } from './context';
import { structuredResponse, type NovelLLM } from './llm';
import { planReviewSchema } from './proseReviewSchema';
import { readThesisReview, type ThesisPlan, type ThesisReview } from './theses';

type Issues = ThesisReview['issues'];
const FIELDS = ['action', 'outcome', 'state_before', 'none'] as const;

export const coverageSchema = (plan: ThesisPlan) => ({
  type: 'object', required: ['coverage'], additionalProperties: false,
  properties: { coverage: { type: 'array', minItems: plan.premise_givens.length, maxItems: plan.premise_givens.length, items: {
    type: 'object', required: ['given', 'kind', 'thesis_id', 'field', 'note'], additionalProperties: false,
    properties: {
      given: { type: 'integer', minimum: 0, maximum: plan.premise_givens.length - 1 },
      kind: { type: 'string', enum: ['story', 'requirement'] },
      thesis_id: { type: 'string', enum: plan.theses.map(t => t.id) },
      field: { type: 'string', enum: [...FIELDS] }, note: { type: 'string' },
    },
  } } },
});

/** The model says where each given happens; code decides what an unplaced given costs. */
export function readCoverage(raw: any, plan: ThesisPlan): Issues {
  const givens = plan.premise_givens;
  if (!Array.isArray(raw?.coverage) || raw.coverage.length !== givens.length) throw new Error(`Coverage must have one entry for each of the ${givens.length} givens.`);
  const seen = new Set<number>();
  const issues: Issues = [];
  for (const entry of raw.coverage) {
    if (!entry || !Number.isInteger(entry.given) || entry.given < 0 || entry.given >= givens.length || seen.has(entry.given)) throw new Error('Coverage must cite every given index exactly once.');
    if (!['story', 'requirement'].includes(entry.kind) || !FIELDS.includes(entry.field) || !plan.theses.some(t => t.id === entry.thesis_id)) throw new Error(`Coverage entry ${entry.given} needs kind, an existing thesis_id (${plan.theses.map(t => t.id).join(', ')}) and field ${FIELDS.join('|')}.`);
    seen.add(entry.given);
    if (entry.kind === 'requirement' || entry.field === 'action' || entry.field === 'outcome') continue;
    issues.push({ severity: 'major', thesis_ids: [entry.thesis_id],
      problem: `Premise given not on the page: "${givens[entry.given]}" is ${entry.field === 'none' ? 'absent from the outline' : `only background or report in ${entry.thesis_id}`}; no scene has it as its own action or outcome.`,
      required_change: 'Give this premise element a scene that makes it happen in front of the reader: its action or outcome, with the people present. A habit or repeated situation needs at least one occasion played as a scene. Rebalance scene budgets inside the chapter; do not add a recap.' });
  }
  return issues;
}

/**
 * Two questions the bookkeeping review does not ask: does the mechanism survive being
 * played from inside its people, and does every premise given happen in a scene.
 */
export async function premiseChecks(plan: ThesisPlan, request: string, system: string, llm: NovelLLM): Promise<Issues> {
  const outline = JSON.stringify(plan);
  const coverage = await structuredResponse(fillTemplate('THESIS_COVERAGE', coverageRaw, { givens: JSON.stringify(plan.premise_givens.map((given, index) => ({ given: index, text: given }))), plan: JSON.stringify(plan.theses.map(t => ({ id: t.id, chapter: t.chapter, state_before: t.state_before, action: t.action, outcome: t.outcome }))) }), system, llm, ['coverage'],
    raw => readCoverage(raw, plan),
    { stage: 'thesis-premise-coverage', route: 'validator', schema: coverageSchema(plan), maxTokens: 4096 });
  const stress = await structuredResponse(fillTemplate('THESIS_STRESS', stressRaw, { input: request, plan: outline }), system, llm, ['ready', 'issues'],
    raw => readThesisReview(raw, plan).issues,
    { stage: 'thesis-plan-stress', route: 'validator', schema: planReviewSchema(plan.theses.map(t => t.id)), maxTokens: 8192, deliberate: true });
  // The outline is played forward once as a stage manager would: is every person, object and
  // piece of knowledge in place before the scene that uses it. The plan is frozen after this.
  const dryRun = await structuredResponse(fillTemplate('THESIS_DRYRUN', dryRunRaw, { plan: JSON.stringify(wholeBookPlan(plan)), tracked: JSON.stringify(plan.tracked || []) }), system, llm, ['ready', 'issues'],
    raw => readThesisReview(raw, plan).issues,
    { stage: 'thesis-plan-dryrun', route: 'validator', schema: planReviewSchema(plan.theses.map(t => t.id)), maxTokens: 8192, deliberate: true });
  return [...canonGaps(plan), ...chainGaps(plan), ...coverage, ...dryRun, ...stress];
}

// A judgement: words that say what a body or a mind undergoes instead of what a person does.
const NOT_A_DEED = /\b(feels?|felt|feeling|heart|pulse|stomach|breath\w*|trembl\w*|shak\w*|shiver\w*|afraid|fear\w*|anxi\w*|nervous\w*|panic\w*|dread\w*|realiz\w*|thinks?|wonders?)\b/i;
/** A participant with no deed is where the writer will put a pounding heart. */
export function deedGaps(plan: ThesisPlan): Issues {
  const gaps = plan.theses.flatMap(thesis => thesis.participants.filter(p => !p.does?.trim() || NOT_A_DEED.test(p.does)).map(p => ({ thesis: thesis.id, who: p.character_id, does: p.does?.trim() || '' })));
  if (!gaps.length) return [];
  return [{ severity: 'major', thesis_ids: [...new Set(gaps.map(gap => gap.thesis))],
    problem: 'Participants with no deed, or with a feeling or bodily sensation in its place: ' + gaps.map(gap => `${gap.thesis} ${gap.who}${gap.does ? ` ("${gap.does}")` : ''}`).join('; '),
    required_change: 'In participants, set does for each of these to something the person does with a thing or person present in that place, visible to others and particular to this person and moment. Not a feeling, thought or sensation, and not the scene action restated.' }];
}

/** What code can see is missing from a plan without reading it for meaning. */
export function canonGaps(plan: ThesisPlan): Issues {
  const issues: Issues = [];
  const at = (id: string) => id === 'INITIAL' ? -1 : plan.theses.findIndex(t => t.id === id);
  for (const fact of plan.canon?.facts || []) {
    const source = at(fact.established_in);
    const early = plan.theses.filter((t, index) => index < source && (t.fact_ids || []).includes(fact.id)).map(t => t.id);
    if (early.length) issues.push({ severity: 'major', thesis_ids: [...early, fact.established_in],
      problem: `Fact ${fact.id} ("${fact.truth}") is used in ${early.join(', ')} before the scene that makes it so (${fact.established_in}).`,
      required_change: `Decide which is true. If it was so before the book opens, set its established_in to INITIAL. If it happens in ${fact.established_in}, take ${fact.id} out of the fact_ids of ${early.join(', ')} and out of anything those scenes rely on. If it must be so earlier, move the event to the earliest scene that uses it.` });
    const users = plan.theses.filter(t => (t.fact_ids || []).includes(fact.id));
    if (fact.established_in !== 'INITIAL' && users.length === 1 && !fact.knowledge.length) issues.push({ severity: 'minor', thesis_ids: [fact.established_in],
      problem: `Fact ${fact.id} ("${fact.truth}") is established in ${fact.established_in}, is learned by nobody and is used by no later scene.`, required_change: 'Either a later scene depends on it and says so in fact_ids, or someone learns it, or it is not a fact the plan needs.' });
  }
  for (const thing of (plan.tracked || []).filter(item => item && typeof item.id === 'string' && item.id.trim() && typeof item.name === 'string' && item.name.trim())) {
    const words = thing.name.toLowerCase().split(/[^\p{L}]+/u).filter(word => word.length > 4);
    const named = plan.theses.filter(t => words.some(word => `${t.state_before} ${t.action} ${t.outcome}`.toLowerCase().includes(word))).map(t => t.id);
    if (words.length && named.length < 2) issues.push({ severity: 'major', thesis_ids: named.length ? named : [plan.theses[0].id],
      problem: `"${thing.name}" is named as a thing the plot turns on, but ${named.length ? `only ${named[0]} mentions it` : 'no scene mentions it'} in its state, action or outcome.`,
      required_change: 'A thing the plot turns on appears where it comes into play and again where it matters. Name it in the action or outcome of the scenes that move it or use it, or take it off the tracked list.' });
  }
  return issues;
}

/** Whether a plan states its chain in IDs, so that code can play it. */
export const hasChain = (plan: ThesisPlan): boolean => plan.theses.some(t => Array.isArray(t.needs_things) || Array.isArray(t.needs_knowledge) || Array.isArray(t.moves));

/**
 * The plan played forward by code. Each scene says, in IDs, what must already be so (a thing
 * with a person or in a place, a person knowing a fact) and what it changes. Code keeps where
 * every thing is and who knows what, scene by scene, and reports each need that no earlier
 * scene met, with the scene that needs it and the scene that last touched it. Nothing here
 * is a reading: a need stated and not met cannot pass.
 */
export function chainGaps(plan: ThesisPlan): Issues {
  if (!hasChain(plan)) return [];
  const issues: Issues = [];
  const people = new Map(plan.characters.map(c => [c.id, c.name]));
  const places = new Map((plan.places || []).filter(p => p?.id).map(p => [p.id, p.name]));
  const things = new Map((plan.tracked || []).filter(k => k?.id).map(k => [k.id, k]));
  const facts = new Map((plan.canon?.facts || []).map(f => [f.id, f]));
  const where = (id: string) => people.get(id) ? `with ${people.get(id)}` : places.get(id) ? `in ${places.get(id)}` : id === 'GONE' ? 'gone (destroyed, surrendered or out of reach)' : `at ${id}`;
  const order = (scene: string | undefined) => scene === 'INITIAL' ? -1 : scene === undefined ? Infinity : (i => i < 0 ? Infinity : i)(plan.theses.findIndex(t => t.id === scene));
  const hole = (ids: string[], problem: string, required_change: string) => issues.push({ severity: 'major', thesis_ids: [...new Set(ids)].filter(id => plan.theses.some(t => t.id === id)), problem, required_change });

  const location = new Map<string, { at: string; by: string }>();
  for (const [id, thing] of things) if (thing.at) location.set(id, { at: thing.at, by: 'the start of the book' });
  plan.theses.forEach((t, index) => {
    const present = new Set([...t.participants.map(p => p.character_id), ...(t.place ? [t.place] : [])]);
    const known = (id: string) => people.has(id) || places.has(id);
    for (const need of t.needs_things || []) {
      const thing = things.get(need.thing);
      if (!thing) { hole([t.id], `${t.id} needs thing ${need.thing}, which is not on the tracked list.`, `Use a tracked ID (${[...things.keys()].join(', ') || 'none defined'}), or add the thing to tracked with where it starts.`); continue; }
      if (!known(need.at)) { hole([t.id], `${t.id} needs "${thing.name}" at ${need.at}, which is neither a character nor a place ID.`, `Use a character ID (${[...people.keys()].join(', ')}) or a place ID (${[...places.keys()].join(', ') || 'none defined'}).`); continue; }
      if (!present.has(need.at)) hole([t.id], `${t.id} needs "${thing.name}" ${where(need.at)}, but that person is not in the scene and the scene is not in that place.`, 'A scene can only use a thing that is with someone present or in the place where the scene happens. Bring the person in, set the scene there, or say where the thing really must be.');
      const now = location.get(need.thing);
      if (!now) hole([t.id], `${t.id} needs "${thing.name}" ${where(need.at)}, but the plan never says where it starts.`, `Give ${need.thing} an "at" on the tracked list, or have an earlier scene move it there.`);
      else if (now.at !== need.at) hole([t.id, now.by], `${t.id} needs "${thing.name}" ${where(need.at)}, but it is ${where(now.at)} — left there by ${now.by} — and no scene between moves it.`,
        `Add the move to the scene where it happens (moves: {thing: "${need.thing}", to: "${need.at}"}) and say so in that scene's action or outcome, or change what ${t.id} needs.`);
    }
    for (const need of t.needs_knowledge || []) {
      const fact = facts.get(need.fact);
      if (!fact || !people.has(need.who)) { hole([t.id], `${t.id} needs ${need.who} to know ${need.fact}; ${!fact ? 'there is no such fact in canon' : 'there is no such character'}.`, 'Use existing character and fact IDs.'); continue; }
      const learned = fact.knowledge.find(k => k.character_id === need.who)?.learned_in;
      if (order(learned) >= index) hole([t.id, ...(learned && learned !== 'INITIAL' ? [learned] : [])], `${t.id} has ${people.get(need.who)} act on "${fact.truth}", but ${learned ? `they learn it only in ${learned}` : 'no scene ever gives it to them'}.`,
        `Give ${people.get(need.who)} this knowledge in a scene before ${t.id} — set learned_in to that scene and show in its action how they come by it — or change what ${t.id} has them do.`);
    }
    for (const move of t.moves || []) {
      const thing = things.get(move.thing);
      if (!thing) { hole([t.id], `${t.id} moves thing ${move.thing}, which is not on the tracked list.`, 'Use a tracked ID or add the thing to tracked.'); continue; }
      if (move.to !== 'GONE' && !known(move.to)) { hole([t.id], `${t.id} moves "${thing.name}" to ${move.to}, which is neither a character, a place nor GONE.`, 'Use a character ID, a place ID or GONE.'); continue; }
      if (move.to !== 'GONE' && !present.has(move.to)) hole([t.id], `${t.id} moves "${thing.name}" ${where(move.to)}, but that person is not in the scene and the scene is not in that place.`, 'A thing can be handed to someone present or left in the place where the scene happens.');
      location.set(move.thing, { at: move.to, by: t.id });
    }
  });
  const last = plan.theses.at(-1)!;
  for (const id of plan.ending_rests_on || []) {
    const fact = facts.get(id);
    if (!fact) { hole([last.id], `The ending is said to rest on ${id}, which is not a fact in canon.`, 'List in ending_rests_on the canon facts the resolution needs.'); continue; }
    if (order(fact.established_in) === Infinity) hole([last.id], `The ending rests on "${fact.truth}", which no scene establishes.`, 'Name the scene in which this becomes so.');
    const learned = fact.knowledge.find(k => k.character_id === last.pov_id)?.learned_in;
    if (order(learned) === Infinity) hole([last.id], `The ending rests on "${fact.truth}", and ${people.get(last.pov_id)} never learns it.`, `Give ${people.get(last.pov_id)} this in a named scene, with how they come by it, or do not rest the ending on it.`);
    if (fact.reader_learns_in === 'NEVER') hole([last.id], `The ending rests on "${fact.truth}", and the reader is never given it.`, 'Set reader_learns_in to the scene that shows it.');
  }
  return issues;
}
