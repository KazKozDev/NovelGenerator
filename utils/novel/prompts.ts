import systemContractRaw from '../../prompts/system-contract.md?raw';
import p01Raw from '../../prompts/P01_BOOK_DESIGN.md?raw';
import p02Raw from '../../prompts/P02_PLAN_REVIEW.md?raw';
import p03Raw from '../../prompts/P03_CHAPTER_PLAN.md?raw';
import p04Raw from '../../prompts/P04_SCENE_WRITE.md?raw';
import p05Raw from '../../prompts/P05_STATE_UPDATE.md?raw';
import p06Raw from '../../prompts/P06_FORWARD_UPDATE.md?raw';
import p07Raw from '../../prompts/P07_FINAL_AUDIT.md?raw';

/**
 * The seven pipeline prompts plus the shared system contract live as files under
 * `prompts/`, one prompt per file, instead of string literals scattered through the
 * engine. Application code never hand-builds these prompts: it names one and supplies
 * its variables, and the loader refuses to return a prompt with a hole in it.
 */
export type PipelinePromptName =
  | 'P01_BOOK_DESIGN'
  | 'P02_PLAN_REVIEW'
  | 'P03_CHAPTER_PLAN'
  | 'P04_SCENE_WRITE'
  | 'P05_STATE_UPDATE'
  | 'P06_FORWARD_UPDATE'
  | 'P07_FINAL_AUDIT';

const TEMPLATES: Record<PipelinePromptName, string> = {
  P01_BOOK_DESIGN: p01Raw,
  P02_PLAN_REVIEW: p02Raw,
  P03_CHAPTER_PLAN: p03Raw,
  P04_SCENE_WRITE: p04Raw,
  P05_STATE_UPDATE: p05Raw,
  P06_FORWARD_UPDATE: p06Raw,
  P07_FINAL_AUDIT: p07Raw,
};

export const PIPELINE_PROMPT_NAMES = Object.keys(TEMPLATES) as PipelinePromptName[];

export function systemContract(vars: Record<string, string>): string {
  return fillTemplate('system-contract', systemContractRaw, vars);
}

/** Every {{variable}} a template declares, so callers and tests can see the contract. */
export function promptVariables(name: PipelinePromptName): string[] {
  const found = new Set<string>();
  for (const match of TEMPLATES[name].matchAll(/\{\{(\w+)\}\}/g)) found.add(match[1]);
  return [...found];
}

function fillTemplate(name: string, template: string, vars: Record<string, string>): string {
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
