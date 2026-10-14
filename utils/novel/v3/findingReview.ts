import type { Passage } from './continuityEval';

export type FindingStatus = 'confirmed' | 'refuted' | 'insufficient_data';
export interface FindingCheck {
  status: FindingStatus;
  same_entity: boolean;
  same_event: boolean;
  same_time: boolean;
  established_facts: boolean;
  incompatible: boolean;
  incompatibility: string;
  explanation_refs: string[];
}
/** Source paragraphs are extracted by code. Model-written quotations are never evidence in this protocol. */
export function resolveEvidence(items: any[], passages: Passage[]) {
  if (!Array.isArray(items)) throw new Error('Evidence must be an array.');
  return items.map(item => {
    const passage = passages.find(p => p.id === item?.passage);
    if (!passage) throw new Error(`Unknown evidence reference: ${String(item?.passage)}. Use an exact ID from the supplied manuscript; no guessed numbering or ranges.`);
    return { ...item, passage: passage.id, quote: passage.text };
  });
}
export function findingStatus(check: unknown, passages: Passage[], continuity = false): FindingStatus {
  const c = check as FindingCheck | undefined;
  if (!c || !['confirmed', 'refuted', 'insufficient_data'].includes(c.status)) return 'insufficient_data';
  if (!Array.isArray(c.explanation_refs) || c.explanation_refs.some(id => !passages.some(p => p.id === id))) return 'insufficient_data';
  const flags = ['same_entity', 'same_event', 'same_time', 'established_facts', 'incompatible'] as const;
  if (flags.some(k => typeof c[k] !== 'boolean')) return 'insufficient_data';
  if (c.status === 'confirmed' && (!c.incompatible || !c.established_facts || !c.incompatibility?.trim()
    || c.explanation_refs.length || (continuity && (!c.same_entity || !c.same_event || !c.same_time)))) return 'insufficient_data';
  if (c.status === 'refuted' && c.incompatible && c.established_facts && !c.explanation_refs.length
    && (!continuity || (c.same_entity && c.same_event && c.same_time))) return 'insufficient_data';
  return c.status;
}
export const FINDING_CHECK = `For EACH suspected issue, assess it yourself before reporting it; no second reader will be called. Supply check:{status:"confirmed|refuted|insufficient_data",same_entity:boolean,same_event:boolean,same_time:boolean,established_facts:boolean,incompatible:boolean,incompatibility:"concrete incompatible facts, or why the allegation fails",explanation_refs:["paragraph IDs explaining the difference later"]}. Inspect the entire manuscript for explanations. Speech, belief, speculation and allegations are not established facts without narrative support. Identical facts (including identical ages) are compatible. A continuity error requires the same entity, event and time. Only confirmed issues are grounded repair suggestions; the author decides whether to act; retain refuted and insufficient_data issues for the report. For missing causal links explain the necessary dependency and the actual outcome, not an arbitrary preference. Evidence contains paragraph references and source kinds only: NEVER copy quotations; code extracts their text.`;
