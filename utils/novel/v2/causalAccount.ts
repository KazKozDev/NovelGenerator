import { thesisPlanSchema } from './thesisSchema';
import type { ThesisPlan } from './theses';

export const canonicalRepairSchema = {
  type: 'object', required: ['plan'], additionalProperties: false,
  properties: { plan: thesisPlanSchema },
};

/** Explanatory notes mirror the canonical plan; they never introduce another story. */
export function accountFromPlan(plan: ThesisPlan): Record<string, string> {
  return {
    timeline: JSON.stringify(plan.theses.map(t => ({id:t.id,when:t.when,requires:t.requires,action:t.action,outcome:t.outcome}))),
    evidence: JSON.stringify(plan.canon?.facts ?? plan.theses.map(t => ({id:t.id,establishes:t.establishes}))),
    knowledge: JSON.stringify({initial:plan.characters.map(c=>({id:c.id,knowledge:c.initial_knowledge})),facts:plan.canon?.facts.map(f=>({id:f.id,source:f.established_in,knowledge:f.knowledge})) ?? []}),
    framing: JSON.stringify(plan.theses.map(t=>({id:t.id,why:t.why,resistance:t.resistance,participants:t.participants}))),
    protagonist_choice: JSON.stringify({choices:plan.theses.map(t=>({id:t.id,pov:t.pov_id,action:t.action,why:t.why,outcome:t.outcome})),ending:plan.ending}),
  };
}

export const ACCOUNT_KEYS = ['timeline', 'evidence', 'knowledge', 'framing', 'protagonist_choice'] as const;
const ACCOUNT_DESCRIPTIONS = {
  timeline:'Actual chronology and causal steps of this story.',
  evidence:'Observable facts supporting beliefs and decisions; clues only when relevant to this genre.',
  knowledge:'What each character knows, when and from which source.',
  framing:'Character interpretations, constraints and stakes; accusations or deception only if present in this story.',
  protagonist_choice:'Consequential choices made by the protagonist and how they affect the outcome.',
};
export const causalRepairSchema = {
  type: 'object', required: ['plan', 'account'], additionalProperties: false,
  properties: {
    plan: thesisPlanSchema,
    account: {
      type: 'object', required: [...ACCOUNT_KEYS], additionalProperties: false,
      properties: Object.fromEntries(ACCOUNT_KEYS.map(key => [key, {type: 'string', minLength: 1, description:ACCOUNT_DESCRIPTIONS[key]}])),
    },
  },
};

// Accept a structured explanation without discarding its content. Missing facts
// stay missing: never substitute a default, alias or the approved plan itself.
const containsExplanation = (value: unknown): boolean => {
  if (typeof value === 'string') return !!value.trim();
  if (Array.isArray(value)) return value.length > 0 && value.some(containsExplanation);
  if (value && typeof value === 'object') {
    const values = Object.values(value);
    return values.length > 0 && values.some(containsExplanation);
  }
  return false;
};
export function readCausalAccount(value: unknown): Record<string, string> {
  const account = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const invalid = ACCOUNT_KEYS.filter(key => !containsExplanation(account[key]));
  if (invalid.length) throw new Error(`Causal account has missing or empty explanations: ${invalid.join(', ')}. Return account with exactly these five keys: ${ACCOUNT_KEYS.join(', ')}; each value must explain concrete events as a nonempty string.`);
  return Object.fromEntries(ACCOUNT_KEYS.map(key => [key, typeof account[key] === 'string' ? (account[key] as string).trim() : JSON.stringify(account[key])]));
}
