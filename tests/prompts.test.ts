import { describe, it, expect } from 'vitest';
import { PIPELINE_PROMPT_NAMES, promptVariables, renderPrompt, systemContract } from '../utils/novel/prompts';

function sampleVars(name: 'system-contract' | Parameters<typeof promptVariables>[0]): Record<string, string> {
  const vars: Record<string, string> = {};
  const names = name === 'system-contract'
    ? ['story_language', 'planning_language']
    : promptVariables(name);
  for (const key of names) vars[key] = `[${key}]`;
  return vars;
}

describe('Pipeline prompts on disk', () => {
  it('covers every pipeline prompt', () => {
    expect(PIPELINE_PROMPT_NAMES).toEqual([
      'P01_BOOK_DESIGN',
      'P02_PLAN_REVIEW',
      'P03_CHAPTER_PLAN',
      'P03_SCENE_REBASE',
      'P04_SCENE_WRITE',
      'P05_STATE_UPDATE',
      'P06_FORWARD_UPDATE',
      'P07_FINAL_AUDIT',
    ]);
  });

  it('renders every prompt with no unfilled holes', () => {
    for (const name of PIPELINE_PROMPT_NAMES) {
      const rendered = renderPrompt(name, sampleVars(name));
      expect(rendered).not.toMatch(/\{\{\w+\}\}/);
      expect(rendered.length).toBeGreaterThan(500);
    }
    const contract = systemContract(sampleVars('system-contract'));
    expect(contract).not.toMatch(/\{\{\w+\}\}/);
  });

  it('refuses a prompt with a missing variable instead of sending a hole to the model', () => {
    expect(() => renderPrompt('P01_BOOK_DESIGN', {})).toThrow(/missing variables.*premise/);
    expect(() => renderPrompt('P04_SCENE_WRITE', { scene_plan: 'x' })).toThrow(/missing variables/);
  });

  it('keeps every JSON format block parseable', () => {
    // P04 returns prose only by design; every other prompt carries a JSON format block.
    for (const name of PIPELINE_PROMPT_NAMES) {
      const rendered = renderPrompt(name, sampleVars(name));
      const blocks = [...rendered.matchAll(/^\{[\s\S]*?\n\}/gm)].map(match => match[0]);
      if (name === 'P04_SCENE_WRITE') {
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
