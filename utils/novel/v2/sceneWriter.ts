import { renderPrompt, systemContract } from '../prompts';
import type { NovelLLM } from './llm';

/**
 * SceneWriter: one verified package in, one finished scene out. A single
 * variant — no competing drafts, no literary second pass. The prompt demands
 * prose only, so the call goes out as raw text (no JSON envelope); the answer
 * is checked for an empty page or planning apparatus, with one retry on a
 * technical breach. Regeneration is never a routine way to reach a style.
 */
export interface SceneWriterInput {
  contextVars: Record<string, string>;
}

function cleanProse(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Scene writer returned an empty page.');
  const prose = text.trim();
  if (/^```/.test(prose) || /^\s*\{/.test(prose)) {
    throw new Error('Scene writer returned apparatus instead of prose.');
  }
  if (/<\/?think>/i.test(prose)) throw new Error('Thinking markup remains inside final prose.');
  return prose;
}

export async function writeSceneV2(input: SceneWriterInput, llm: NovelLLM): Promise<string> {
  const system = systemContract();
  const prompt = renderPrompt('P04_SCENE_WRITE', input.contextVars);
  try {
    return cleanProse(await llm(prompt, system, { temperature: 0.7, maxTokens: 8192, route: 'writer' }));
  } catch (first) {
    const retry = await llm(
      `${prompt}\nYour previous answer was unusable (${first instanceof Error ? first.message : first}). Return only the finished scene prose now.`,
      system,
      { temperature: 0.7, maxTokens: 8192, route: 'writer' },
    );
    return cleanProse(retry);
  }
}
