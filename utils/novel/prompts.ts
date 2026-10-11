import readerTracesRaw from '../../prompts/P01_READER_TRACES.md?raw';
import readerInferRaw from '../../prompts/P01_READER_INFER.md?raw';
import readerReviewRaw from '../../prompts/P01_READER_REVIEW.md?raw';
import intention2Raw from '../../prompts/P01_INTENTION_RESOLVE.md?raw';
import intention1Raw from '../../prompts/P01_INTENTION_CHOICE.md?raw';
import intention0Raw from '../../prompts/P01_INTENTION_SITUATIONS.md?raw';
import systemContractRaw from '../../prompts/system-contract.md?raw';
import p01SelectRaw from '../../prompts/P01_CONCEPT_SELECT.md?raw';
import p01Raw from '../../prompts/P01_BOOK_DESIGN.md?raw';
import p02Raw from '../../prompts/P02_PLAN_REVIEW.md?raw';
import p02RefineRaw from '../../prompts/P02_PLAN_REFINE.md?raw';
import p03Raw from '../../prompts/P03_CHAPTER_PLAN.md?raw';
import p03SceneRebaseRaw from '../../prompts/P03_SCENE_REBASE.md?raw';
import p04Raw from '../../prompts/P04_SCENE_WRITE.md?raw';
import p05Raw from '../../prompts/P05_STATE_UPDATE.md?raw';
import p06Raw from '../../prompts/P06_FORWARD_UPDATE.md?raw';
import p07Raw from '../../prompts/P07_FINAL_AUDIT.md?raw';
import p08Raw from '../../prompts/P08_SPAN_REPAIR.md?raw';
import p09Raw from '../../prompts/P09_BEAT_CONDENSE.md?raw';
import p10Raw from '../../prompts/P10_SPAN_CORRECT.md?raw';
import p11Raw from '../../prompts/P11_BEAT_INSERT.md?raw';

/**
 * The pipeline prompts plus the shared system contract live as files under
 * `prompts/`, one prompt per file, instead of string literals scattered through the
 * engine. Application code never hand-builds these prompts: it names one and supplies
 * its variables, and the loader refuses to return a prompt with a hole in it.
 */
export type PipelinePromptName =
  | 'P01_CONCEPT_SELECT'
  | 'P01_INTENTION_SITUATIONS'
  | 'P01_INTENTION_CHOICE'
  | 'P01_INTENTION_RESOLVE'
  | 'P01_READER_TRACES'
  | 'P01_READER_INFER'
  | 'P01_READER_REVIEW'
  | 'P01_BOOK_DESIGN'
  | 'P02_PLAN_REVIEW'
  | 'P02_PLAN_REFINE'
  | 'P03_CHAPTER_PLAN'
  | 'P03_SCENE_REBASE'
  | 'P04_SCENE_WRITE'
  | 'P05_STATE_UPDATE'
  | 'P06_FORWARD_UPDATE'
  | 'P07_FINAL_AUDIT'
  | 'P08_SPAN_REPAIR'
  | 'P09_BEAT_CONDENSE'
  | 'P10_SPAN_CORRECT'
  | 'P11_BEAT_INSERT';

const TEMPLATES: Record<PipelinePromptName, string> = {
  P01_BOOK_DESIGN: p01Raw,
  P01_CONCEPT_SELECT: p01SelectRaw,
  P01_INTENTION_SITUATIONS: intention0Raw,
  P01_INTENTION_CHOICE: intention1Raw,
  P01_INTENTION_RESOLVE: intention2Raw,
  P01_READER_TRACES: readerTracesRaw,
  P01_READER_INFER: readerInferRaw,
  P01_READER_REVIEW: readerReviewRaw,
  P02_PLAN_REVIEW: p02Raw,
  P02_PLAN_REFINE: p02RefineRaw,
  P03_CHAPTER_PLAN: p03Raw,
  P03_SCENE_REBASE: p03SceneRebaseRaw,
  P04_SCENE_WRITE: p04Raw,
  P05_STATE_UPDATE: p05Raw,
  P06_FORWARD_UPDATE: p06Raw,
  P07_FINAL_AUDIT: p07Raw,
  P08_SPAN_REPAIR: p08Raw,
  P09_BEAT_CONDENSE: p09Raw,
  P10_SPAN_CORRECT: p10Raw,
  P11_BEAT_INSERT: p11Raw,
};

export const PIPELINE_PROMPT_NAMES = Object.keys(TEMPLATES) as PipelinePromptName[];

export function systemContract(): string {
  return fillTemplate('system-contract', systemContractRaw, {});
}

/** Every {{variable}} a template declares, so callers and tests can see the contract. */
export function promptVariables(name: PipelinePromptName): string[] {
  const found = new Set<string>();
  for (const match of TEMPLATES[name].matchAll(/\{\{(\w+)\}\}/g)) found.add(match[1]);
  return [...found];
}

export function fillTemplate(name: string, template: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const filled = template.replace(/\{\{(\w+)\}\}/g, (hole, key: string) => {
    if (!Object.hasOwn(vars, key)) {
      missing.add(key);
      return hole;
    }
    return vars[key];
  });
  if (missing.size) {
    throw new Error(`Prompt ${name} is missing variables: ${[...missing].join(', ')}`);
  }
  return filled;
}

/** Render a pipeline prompt with all its variables supplied. Throws on any gap. */
export function renderPrompt(name: PipelinePromptName, vars: Record<string, string>): string {
  return fillTemplate(name, TEMPLATES[name], vars);
}
