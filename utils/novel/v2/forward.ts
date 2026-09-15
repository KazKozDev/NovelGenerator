import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, type NovelLLM } from './llm';
import { matchKey, stringList } from './normalize';
import { describeStateDigest } from './stateDigest';
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
}

const FORWARD_KEYS = ['chapter_outcome', 'consequences_to_carry_forward', 'next_chapter_inputs',
  'plan_updates', 'ending_readiness', 'unresolved_blockers'];

export async function updateForward(input: ForwardInput, llm: NovelLLM): Promise<ForwardUpdate> {
  const system = systemContract();
  const prompt = renderPrompt('P06_FORWARD_UPDATE', {
    story_contract: JSON.stringify(input.design.contract),
    chapter_map: JSON.stringify(input.design.chapter_map),
    completed_chapter: input.chapterOutcome,
    accepted_state: typeof input.acceptedState === 'string'
      ? input.acceptedState
      : describeStateDigest(input.acceptedState as Parameters<typeof describeStateDigest>[0]),
    open_threads: JSON.stringify(input.openThreads),
    ending_dependencies: JSON.stringify(input.design.ending.required_setup),
    remaining_budget: `${input.remainingChapters} chapters, about ${input.remainingWords} words`,
  });
  const raw = await structuredResponse(prompt, system, llm, FORWARD_KEYS, parsed => parsed,
    { temperature: 0.2, maxTokens: 8192, route: 'validator' });
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
  const established = new Set(readiness.established_requirements.map(matchKey));
  const standing = required.filter(item => !established.has(matchKey(item)));
  const known = new Set(standing.map(matchKey));
  const added = readiness.remaining_requirements.filter(item => !known.has(matchKey(item)) && !established.has(matchKey(item)));
  return [...standing, ...added];
}
