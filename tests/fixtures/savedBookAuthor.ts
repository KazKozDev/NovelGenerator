import type { NovelLLM } from '../../utils/novel/v2/llm';
import { cleanAuditJSON } from './baselineAudit';
export const scriptedSavedBookAuthor: NovelLLM = async (prompt, _system, options) => {
  if (!options?.stage?.startsWith('craft-author-')) return cleanAuditJSON;
  const data = JSON.parse(prompt.match(/AUTHOR INPUT DATA:\n([^\n]+)/)![1]);
  const source = Object.entries(data).find(([key]) => key.endsWith('/source.json'))![1] as { chapters: { chapter: number; text: string }[]; scenes?: { id: string; chapter: number; text: string }[] };
  if (options.stage === 'craft-author-recover') return JSON.stringify({ observations: source.chapters.map(c => ({ id: `CH${c.chapter}`, kind: 'enacted text', chapter: c.chapter, quote: c.text, statement: 'Only the saved prose is established.' })), unknowns: [], proposals: [] });
  const targets = Object.entries(data).find(([key]) => key.endsWith('/targets.json'))![1] as { id: string; chapter: number; targetWords: number }[];
  return JSON.stringify({ problem: 'Keep the effective saved text.', openingPromise: 'Present the story.', endingExecution: 'Keep the supplied ending.', scenes: targets.map(t => ({ id: t.id, chapter: t.chapter, sources: [source.scenes!.find(s => s.chapter === t.chapter)!.id], operation: 'keep', instruction: 'Keep.', dependencies: [], beforeState: 'Saved.', afterState: 'Saved.', revealChanges: 'None.', targetWords: t.targetWords })) });
};
