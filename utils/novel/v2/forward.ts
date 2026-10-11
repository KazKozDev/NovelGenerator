import { contentWords } from '../analytics';
import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, type NovelLLM } from './llm';
import { matchKey, stringList } from './normalize';
import { describeStateDigest } from './stateDigest';
import type { SceneRecord } from './store';
import type { BookDesign, EndingReadiness, ForwardUpdate } from './types';

/**
 * ForwardUpdate (P06): after a chapter, reconcile the accepted text with the
 * remaining plan. Accepted prose outranks the old plan; only affected chapters
 * and dependencies change, and only on textual grounds.
 */

export interface ForwardInput {
  design: BookDesign;
  completedChapter: number;
  chapterOutcome: string;
  acceptedState: unknown;
  openThreads: string[];
  remainingChapters: number;
  remainingWords: number;
  /**
   * What the chapter's own scenes recorded, in order. The digest above is the
   * recent stretch of the whole book, and with an editor that records two dozen
   * events a scene it does not reach back to the chapter's first scene — so the
   * call deciding what the chapter established was reading its last page.
   */
  chapterEvents?: string[];
  /** Where the scenes departed from their plans: extracted every scene and, until now, read by nothing. */
  planDeviations?: string[];
  /** The chapter itself, every paragraph under its reference, so a correction can point at a sentence. */
  chapterText?: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** What a chapter's own scenes put on record, in order: its events and the particulars it fixed. */
export function chapterEvents(records: SceneRecord[]): string[] {
  return records.flatMap(record => [
    ...(record.delta?.events || []).map(event => `${record.id}: ${event.description}`),
    ...(record.delta?.established_facts || []).map(fact => `${record.id} (fact): ${text(fact?.statement)}`),
  ]);
}

/** Where a chapter's scenes departed from their plans, as the tracker recorded it scene by scene. */
export function chapterDeviations(records: SceneRecord[]): string[] {
  return records.flatMap(record => (record.delta?.plan_deviations || [])
    .filter(item => text(item?.planned) || text(item?.actual))
    .map(item => `${record.id}: planned "${text(item.planned)}", written "${text(item.actual)}"${text(item.future_dependency_affected) ? ` — affects ${text(item.future_dependency_affected)}` : ''}`));
}

const FORWARD_KEYS = ['chapter_outcome', 'consequences_to_carry_forward', 'next_chapter_inputs',
  'plan_updates', 'ending_readiness', 'unresolved_blockers'];

export async function updateForward(input: ForwardInput, llm: NovelLLM): Promise<ForwardUpdate> {
  const system = systemContract();
  const prompt = renderPrompt('P06_FORWARD_UPDATE', {
    story_contract: JSON.stringify(input.design.contract),
    book_design_digest: JSON.stringify({ dramatic_core: input.design.dramatic_core, causal_map: input.design.causal_map, ending: input.design.ending }),
    chapter_text_with_refs: input.chapterText || '(the chapter text is not supplied; propose no repairs)',
    chapter_map: JSON.stringify(input.design.chapter_map),
    completed_chapter: input.chapterOutcome,
    accepted_state: typeof input.acceptedState === 'string'
      ? input.acceptedState
      : describeStateDigest(input.acceptedState as Parameters<typeof describeStateDigest>[0]),
    chapter_events: input.chapterEvents?.length ? input.chapterEvents.join('\n') : '(nothing recorded)',
    plan_deviations: input.planDeviations?.length ? input.planDeviations.join('\n') : '(the scenes kept to their plans)',
    open_threads: JSON.stringify(input.openThreads),
    ending_dependencies: describeEndingRequirements(input.design),
    remaining_budget: `${input.remainingChapters} chapters, about ${input.remainingWords} words`,
  });
  const raw = await structuredResponse(prompt, system, llm, FORWARD_KEYS, parsed => parsed,
    { temperature: 0.2, maxTokens: 8192, route: 'validator', stage: 'forward', deliberate: true });
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { plan_updates?: unknown }).plan_updates)) {
    throw new Error('Forward update has no plan_updates.');
  }
  return raw as ForwardUpdate;
}

/**
 * Apply plan updates to the chapter map in code. Only known chapter fields move;
 * anything else is reported, not silently dropped or invented.
 */
export function applyPlanUpdates(design: BookDesign, update: ForwardUpdate): { design: BookDesign; skipped: string[] } {
  const skipped: string[] = [];
  const chapters = design.chapter_map.map(entry => ({ ...entry }));
  for (const change of update.plan_updates) {
    const entry = chapters.find(item => item.chapter === change.chapter);
    if (!entry) {
      skipped.push(`chapter ${change.chapter}: no such chapter`);
      continue;
    }
    if (change.field in entry) {
      (entry as Record<string, unknown>)[change.field] = change.new_value;
    } else {
      skipped.push(`chapter ${change.chapter}: unknown field ${change.field}`);
    }
  }
  return { design: { ...design, chapter_map: chapters }, skipped };
}

/**
 * The ending readiness as the model reported it, with every list made a list of
 * strings. Nothing is judged here: whether a requirement is really established is
 * P06's reading of the accepted text, and code only carries the verdict.
 */
export function readEndingReadiness(update: ForwardUpdate): EndingReadiness {
  const readiness = update.ending_readiness && typeof update.ending_readiness === 'object'
    ? update.ending_readiness : {} as EndingReadiness;
  return {
    established_requirements: stringList(readiness.established_requirements),
    remaining_requirements: stringList(readiness.remaining_requirements),
    capacity_problems: stringList(readiness.capacity_problems),
  };
}

/**
 * What the planner should still be told to prepare. The design's required_setup
 * stays authoritative — a model that forgets a requirement cannot retire it — so
 * the list is the design's own, minus what the last reading found established,
 * plus anything the reading added that the design never named.
 */
export function remainingEndingRequirements(design: BookDesign, readiness: EndingReadiness | null): string[] {
  const required = stringList(design.ending?.required_setup);
  if (!readiness) return required;
  const standing = required.filter((item, index) => !isEstablished(item, index, readiness.established_requirements));
  const known = new Set(required.map(requirementKey));
  const added = readiness.remaining_requirements
    .filter(item => !known.has(requirementKey(item)) && !/^E\d+\b/i.test(item.trim()))
    .filter(item => !readiness.established_requirements.some(done => requirementKey(done) === requirementKey(item)));
  return [...standing, ...added];
}

/** The finale's requirements as the closing call is shown them: each under an id it can cite. */
export function describeEndingRequirements(design: BookDesign): string {
  const required = stringList(design.ending?.required_setup);
  return required.length ? required.map((item, index) => `E${index + 1} — ${item}`).join('\n') : '(none)';
}

/** A requirement without its id or the chapter it was assigned to, for comparing two wordings of it. */
function requirementKey(text: string): string {
  return matchKey(text.replace(/^\s*E\d+\s*[—:.-]+\s*/i, '').replace(/\s*\(chapter \d+\)\s*$/i, ''));
}

/**
 * Whether the reading retired a requirement. It cites the id, or the text; and
 * since the text comes back retyped — a clause dropped, the assigned chapter
 * left off — a wording that keeps most of the requirement's own words is the
 * requirement. Exact comparison retired none of seven in a measured run whose
 * reading had found all seven established, and the last chapter was planned
 * against an ending the book had already paid for.
 */
function isEstablished(requirement: string, index: number, established: string[]): boolean {
  const key = requirementKey(requirement);
  const words = new Set(contentWords(key));
  return established.some(entry => {
    const id = /^\s*E(\d+)\b/i.exec(entry);
    if (id) return Number(id[1]) === index + 1;
    if (requirementKey(entry) === key) return true;
    if (words.size < 4) return false;
    const theirs = new Set(contentWords(requirementKey(entry)));
    return [...words].filter(word => theirs.has(word)).length / words.size >= 0.7;
  });
}
