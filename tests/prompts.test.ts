import { describe, it, expect } from 'vitest';
import { PIPELINE_PROMPT_NAMES, promptVariables, renderPrompt, systemContract } from '../utils/novel/prompts';

function sampleVars(name: Parameters<typeof promptVariables>[0]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of promptVariables(name)) vars[key] = `[${key}]`;
  return vars;
}

describe('Pipeline prompts on disk', () => {
  it('covers every pipeline prompt', () => {
    expect(PIPELINE_PROMPT_NAMES).toEqual([
      'P01_BOOK_DESIGN',
      'P01_CONCEPT_SELECT',
      'P01_INTENTION_SITUATIONS',
      'P01_INTENTION_CHOICE',
      'P01_INTENTION_RESOLVE',
      'P01_READER_TRACES',
      'P01_READER_INFER',
      'P01_READER_REVIEW',
      'P02_PLAN_REVIEW',
      'P02_PLAN_REFINE',
      'P03_CHAPTER_PLAN',
      'P03_SCENE_REBASE',
      'P04_SCENE_WRITE',
      'P05_STATE_UPDATE',
      'P06_FORWARD_UPDATE',
      'P07_FINAL_AUDIT',
      'P08_SPAN_REPAIR',
      'P09_BEAT_CONDENSE',
      'P10_SPAN_CORRECT',
      'P11_BEAT_INSERT',
    ]);
  });

  it('renders every prompt with no unfilled holes', () => {
    for (const name of PIPELINE_PROMPT_NAMES) {
      const rendered = renderPrompt(name, sampleVars(name));
      expect(rendered).not.toMatch(/\{\{\w+\}\}/);
      expect(rendered.length).toBeGreaterThan(500);
    }
    const contract = systemContract();
    expect(contract).not.toMatch(/\{\{\w+\}\}/);
  });

  it('refuses a prompt with a missing variable instead of sending a hole to the model', () => {
    expect(() => renderPrompt('P01_BOOK_DESIGN', {})).toThrow(/missing variables.*premise/);
    expect(() => renderPrompt('P04_SCENE_WRITE', { scene_plan: 'x' })).toThrow(/missing variables/);
  });

  it('keeps every JSON format block parseable', () => {
    // P04 and P11 return prose only by design; every other prompt carries a JSON format block.
    for (const name of PIPELINE_PROMPT_NAMES) {
      const rendered = renderPrompt(name, sampleVars(name));
      const blocks = [...rendered.matchAll(/^\{[\s\S]*?\n\}/gm)].map(match => match[0]);
      if (name === 'P01_BOOK_DESIGN') {
        expect(promptVariables(name)).toContain('output_schema');
        continue;
      }
      if (name === 'P04_SCENE_WRITE' || name === 'P11_BEAT_INSERT') {
        expect(blocks.length).toBe(0);
        continue;
      }
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(() => JSON.parse(block), `${name} has an unparseable JSON block`).not.toThrow();
      }
    }
  });
});
