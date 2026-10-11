import { fillTemplate } from '../prompts';
import stressRaw from '../../../prompts/THESIS_STRESS.md?raw';
import coverageRaw from '../../../prompts/THESIS_COVERAGE.md?raw';
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
  return [...coverage, ...stress];
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
