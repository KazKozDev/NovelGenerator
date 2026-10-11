import { fillTemplate } from '../prompts';
import stateRaw from '../../../prompts/THESIS_STATE.md?raw';
import { structuredResponse, type NovelLLM } from './llm';
import type { ThesisPlan, ThesisReview } from './theses';

/**
 * Where the things the plot turns on actually are, scene by scene. The planner names the
 * things; a short closed question per scene says how each ends it; code keeps the table,
 * hands the next writer its last row, and turns a verified conflict into a finding.
 */
export interface Tracked { id: string; name: string; start: string }
export interface StateAnswer { id: string; status: 'unchanged' | 'changed' | 'conflict'; state: string; quote: string }
export type StateLedger = Record<string, { revision: string; states: StateAnswer[] }>;
export interface StateBefore { id: string; name: string; state: string; since: string }

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const UNPLACED = 'Not yet placed by the text';

/** The planner's things, read tolerantly, and every character's whereabouts. Empty when the plan names none. */
export function trackedItems(plan: ThesisPlan | null | undefined): Tracked[] {
  const named = (Array.isArray(plan?.tracked) ? plan!.tracked : []).filter(item => item && text(item.id) && text(item.name)).slice(0, 10)
    .map(item => ({ id: item.id.trim(), name: item.name.trim(), start: text(item.start) ? item.start.trim() : UNPLACED }));
  if (!named.length) return [];
  const ids = new Set<string>();
  return [...named, ...plan!.characters.map(c => ({ id: `@${c.id}`, name: `Where ${c.name} is`, start: UNPLACED }))].filter(item => !ids.has(item.id) && ids.add(item.id));
}

/** The last recorded state of each thing in the scenes before this one, in outline order. */
export function statesBefore(plan: ThesisPlan, ledger: StateLedger, id: string): StateBefore[] {
  const index = plan.theses.findIndex(t => t.id === id);
  const earlier = plan.theses.slice(0, Math.max(0, index)).map(t => t.id).reverse();
  return trackedItems(plan).map(item => {
    for (const scene of earlier) {
      const answer = ledger[scene]?.states.find(state => state.id === item.id && state.status !== 'unchanged');
      if (answer) return { id: item.id, name: item.name, state: answer.state, since: scene };
    }
    return { id: item.id, name: item.name, state: item.start, since: 'before the book' };
  });
}

const flat = (value: string) => value.replace(/\s+/g, ' ').trim();
/** An answer stands only as far as its quote is in the scene; anything else reads as unchanged. */
export function readStates(raw: any, before: StateBefore[], scene: string): StateAnswer[] {
  if (!Array.isArray(raw?.states)) throw new Error('Return states as an array with one entry per id.');
  const source = flat(scene);
  return before.map(item => {
    const answer = raw.states.find((state: any) => state?.id === item.id);
    const unchanged: StateAnswer = { id: item.id, status: 'unchanged', state: item.state, quote: '' };
    if (!answer || !['changed', 'conflict'].includes(answer.status) || !text(answer.state) || !text(answer.quote)) return unchanged;
    const quote = flat(answer.quote).replace(/^["“”']+|["“”']+$/g, '');
    if (quote.length < 12 || !source.includes(quote)) return unchanged;
    return { id: item.id, status: answer.status, state: flat(answer.state), quote };
  });
}

export function stateIssues(before: StateBefore[], states: StateAnswer[], id: string): ThesisReview['issues'] {
  return states.filter(state => state.status === 'conflict').map(state => {
    const item = before.find(entry => entry.id === state.id)!;
    return { severity: 'major' as const, kind: 'continuity', evidence: state.quote, thesis_ids: [id],
      problem: `${item.name}: ${item.since === 'before the book' ? 'at the start of the book' : `as ${item.since} left it`} — "${item.state}". This scene has it otherwise ("${state.state}") and shows nothing that changes it.`,
      consequence: 'A thing the plot turns on is in two places; whatever later depends on where it is rests on one of them at random.',
      required_change: 'Show the action that moves or changes it in this scene, or keep it as the earlier scene left it. Do not alter the earlier scene to match.' };
  });
}

export function stateBrief(before: StateBefore[]): string {
  const placed = before.filter(item => item.state !== UNPLACED);
  return placed.length ? '\nWhere things stand as this scene opens, from the text already written (not from the plan). Start from these; a change needs an action on the page:\n'
    + placed.map(item => `- ${item.name}: ${item.state} (${item.since})`).join('\n') : '';
}

export async function askStates(scene: string, id: string, before: StateBefore[], system: string, llm: NovelLLM): Promise<StateAnswer[]> {
  return structuredResponse(fillTemplate('THESIS_STATE', stateRaw, { id, scene, items: JSON.stringify(before.map(item => ({ id: item.id, name: item.name, before: item.state }))) }),
    system, llm, ['states'], raw => readStates(raw, before, scene), { stage: 'thesis-state', route: 'validator', maxTokens: 2048, maxAttempts: 3,
      schema: { type: 'object', required: ['states'], additionalProperties: false, properties: { states: { type: 'array', items: { type: 'object', required: ['id', 'status', 'state', 'quote'], additionalProperties: false,
        properties: { id: { type: 'string', enum: before.map(item => item.id) }, status: { type: 'string', enum: ['unchanged', 'changed', 'conflict'] }, state: { type: 'string' }, quote: { type: 'string' } } } } } } });
}
