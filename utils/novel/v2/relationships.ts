import type { StateDelta, StoryState } from './types';

/**
 * Relationships as current state (§3, §6).
 *
 * A character card says who two people were to each other when the book was
 * designed; it never changes. What they are to each other after chapter five is
 * memory, and memory had nowhere to put it — so a rescue could leave no trace and
 * a friendship could arrive with nothing behind it, both for free.
 *
 * A relationship lives in `conditions` like any other current condition, under a
 * directed key: `C01->C02.trust`. Directed, because Zor trusting Pax is not Pax
 * trusting Zor. The value is words, not a number — code never grades a bond, it
 * only carries what the scene proved and shows it to the writer instead of the
 * card.
 */

const RELATION = /^([A-Za-z0-9_.-]+)\s*->\s*([A-Za-z0-9_.-]+)\.(.+)$/;

export interface Relation {
  from: string;
  to: string;
  kind: string;
  value: string;
}

export function isRelationKey(key: string): boolean {
  return RELATION.test(key);
}

export function parseRelation(key: string, value: string): Relation | null {
  const match = key.match(RELATION);
  if (!match) return null;
  return { from: match[1].trim(), to: match[2].trim(), kind: match[3].trim(), value };
}

/** Every recorded relationship touching the scene's participants, in both directions. */
export function relationsFor(state: StoryState, participants: string[]): Relation[] {
  const cast = new Set(participants);
  const relations: Relation[] = [];
  for (const [key, value] of Object.entries(state.conditions || {})) {
    const relation = parseRelation(key, value);
    if (relation && (cast.has(relation.from) || cast.has(relation.to))) relations.push(relation);
  }
  return relations;
}

export function describeRelations(relations: Relation[]): string {
  return relations.length
    ? relations.map(item => `${item.from} → ${item.to} (${item.kind}): ${item.value}`).join('\n')
    : '(nothing recorded yet — the character cards hold the starting relationships)';
}

/**
 * A bond moves on what happened, not on what was said. A relationship change is
 * folded only when it cites the paragraph that proves it and the same scene
 * recorded a deed or something learned; a declaration of trust with no act behind
 * it is a belief about the other person, and belongs on the belief shelf.
 */
export function relationChangeRefused(delta: StateDelta, change: { evidence_refs?: unknown }): string {
  const cited = Array.isArray(change.evidence_refs) && change.evidence_refs.length > 0;
  if (!cited) return 'it cites no paragraph';
  const acted = (delta.events || []).length > 0 || (delta.knowledge_changes || []).length > 0;
  if (!acted) return 'the scene recorded no deed and nothing learned that would move it';
  return '';
}
