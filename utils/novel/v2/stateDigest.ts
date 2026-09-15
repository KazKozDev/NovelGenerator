import type { StoryState } from './types';

/**
 * What a call needs to know about the world, rather than everything the world
 * has recorded.
 *
 * Confirmed state is a ledger, and a ledger only grows. Measured on a finished
 * four-chapter book it was 56KB — 92 events at 25KB and 58 reader disclosures
 * at 14KB, both of them logs — and it was handed whole to six different calls:
 * the chapter planner, the scene readiness review, the scene rebase, the
 * tracker, the forward reconciliation and the audit. The planner's prompt came
 * to 121KB, of which nearly half was this, and it would have been twice that by
 * chapter eight. One chapter cost 1.9 million characters of prompt.
 *
 * Nothing that answers a question is trimmed. Facts are cited by id and are
 * few. Conditions *are* the current world — where everyone stands — and shrink
 * rather than grow as they are overwritten. Names must be exact or the writer
 * invents spellings. Beliefs are current by construction, not a log.
 *
 * What is trimmed is the three that only accumulate. Events, knowledge and
 * disclosures are histories, and a planner needs the recent stretch of a
 * history, not all of it: the causal map carries the book's spine, the threads
 * carry its promises, the previous chapter's own tail carries the immediate
 * past, and the cross-encoder reads the finished prose directly. A dropped
 * event is still in the store — retrieval resolves references against the
 * store, never against the prompt — so a callback to one still works. It is
 * only less likely to be reached for, which is the correct bias for a history
 * the book has moved on from.
 *
 * The audit is the exception and keeps the whole record: reading everything is
 * the job there, and it happens once.
 */

export interface DigestLimits {
  /** Most recent events kept. */
  events: number;
  /** Most recent knowledge entries kept per character. */
  knowledge: number;
  /** Most recent reader disclosures kept. */
  disclosures: number;
}

export const DEFAULT_DIGEST: DigestLimits = { events: 24, knowledge: 8, disclosures: 20 };

export function stateDigest(state: StoryState, limits: DigestLimits = DEFAULT_DIGEST): StoryState {
  const knowledge: Record<string, string[]> = {};
  for (const [character, entries] of Object.entries(state.knowledge || {})) {
    knowledge[character] = entries.slice(-limits.knowledge);
  }
  return {
    facts: state.facts || [],
    conditions: state.conditions || {},
    names: state.names || [],
    beliefs: state.beliefs || {},
    events: (state.events || []).slice(-limits.events),
    knowledge,
    reader_disclosures: (state.reader_disclosures || []).slice(-limits.disclosures),
  };
}

/** The digest as a prompt variable, with the trimming stated rather than hidden. */
export function describeStateDigest(state: StoryState, limits: DigestLimits = DEFAULT_DIGEST): string {
  const events = (state.events || []).length;
  const disclosures = (state.reader_disclosures || []).length;
  const digest = JSON.stringify(stateDigest(state, limits));
  const notes: string[] = [];
  if (events > limits.events) notes.push(`the ${limits.events} most recent of ${events} recorded events`);
  if (disclosures > limits.disclosures) notes.push(`the ${limits.disclosures} most recent of ${disclosures} reader disclosures`);
  if (!notes.length) return digest;
  // Said plainly, because a model that believes it is seeing the whole record
  // will reason as though anything absent from it never happened.
  return `${digest}\n\nThis is ${notes.join(' and ')}. Facts, current conditions, names and beliefs are complete. Earlier events happened and still hold; they are simply not listed here.`;
}
