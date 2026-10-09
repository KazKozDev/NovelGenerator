import { describe, expect, it, vi } from 'vitest';
import { stripApparatus, writeSceneV2 } from '../utils/novel/v2/sceneWriter';
import { promptVariables } from '../utils/novel/prompts';
import type { NovelLLM } from '../utils/novel/v2/llm';

const SCENE = 'Aren climbed while the storm took the rail from her hands.\n\nThe upper room smelled of hot glass and rain.';

describe('What a writer says around a scene', () => {
  it('cuts the announcement above the prose and the report below it', () => {
    const answer = `I'll write the scene following all the instructions. Here's the prose:\n\n${SCENE}\n\nWord count: 500`;
    const { prose, removed } = stripApparatus(answer);
    expect(prose).toBe(SCENE);
    expect(removed).toEqual(["I'll write the scene following all the instructions. Here's the prose:", 'Word count: 500']);
  });

  it('cuts a heading, a trailing rule, a note on what the scene shows, and an offer of more', () => {
    const answer = `## Scene CH01_S01\n\nI’ll write the opening scene…\n\n${SCENE}\n\n---\n\nThis scene establishes Aren's agency and shows the cost of the climb.\n\nLet me know if you'd like any changes!`;
    const { prose, removed } = stripApparatus(answer);
    expect(prose).toBe(SCENE);
    expect(removed).toHaveLength(4);
  });

  it('cuts a count that sits on the last line of the last paragraph', () => {
    expect(stripApparatus(`${SCENE}\n(487 words)`).prose).toBe(SCENE);
  });

  it('leaves fiction that only resembles an announcement', () => {
    for (const opening of [
      "I'll never forget that scene.",
      "I'll write to her tomorrow, I decided.",
      'Here is the story of how the light went out.',
      '"Sure, I\'ll write the scene for you," the clerk said.',
      'Chapter and verse, the keeper knew the tide tables.',
    ]) {
      const text = `${opening}\n\n${SCENE}`;
      expect(stripApparatus(text), opening).toEqual({ prose: text, removed: [] });
    }
    const closing = `${SCENE}\n\nThe scene below the gallery showed her nothing she had not already feared.`;
    expect(stripApparatus(closing)).toEqual({ prose: closing, removed: [] });
  });

  it('never cuts a scene down to nothing', () => {
    expect(stripApparatus("Here's the prose:").prose).toBe("Here's the prose:");
  });

  it('hands the writer back clean prose and reports the cut', async () => {
    const vars = Object.fromEntries(promptVariables('P04_SCENE_WRITE').map(key => [key, `[${key}]`]));
    const llm: NovelLLM = vi.fn(async () => `Here is the scene:\n\n${SCENE}\n\n**Word count: 512**`);
    const cut: string[][] = [];
    const prose = await writeSceneV2({ contextVars: vars, onApparatus: removed => cut.push(removed) }, llm);
    expect(prose).toBe(SCENE);
    expect(cut).toEqual([['Here is the scene:', '**Word count: 512**']]);
    expect(llm).toHaveBeenCalledTimes(1);
  });
});
