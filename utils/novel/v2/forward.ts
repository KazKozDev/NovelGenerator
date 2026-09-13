import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, type NovelLLM } from './llm';
import type { BookDesign, ForwardUpdate } from './types';

/**
 * ForwardUpdate (P06): after a chapter, reconcile the accepted text with the
 * remaining plan. Accepted prose outranks the old plan; only affected chapters
 * and dependencies change, and only on textual grounds.
 */

export interface ForwardInput {
  story_language: string;
  planning_language: string;
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
  const system = systemContract({ story_language: input.story_language, planning_language: input.planning_language });
  const prompt = renderPrompt('P06_FORWARD_UPDATE', {
    story_contract: JSON.stringify(input.design.contract),
    chapter_map: JSON.stringify(input.design.chapter_map),
    completed_chapter: input.chapterOutcome,
    accepted_state: typeof input.acceptedState === 'string' ? input.acceptedState : JSON.stringify(input.acceptedState),
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
