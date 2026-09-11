import { describe, it, expect, vi } from 'vitest';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { createBookSpec, type NovelRun } from '../utils/novel/contracts';
import { MemoryRunStore } from '../utils/novel/runStore';
import { acceptedVersion, reconcileCheckpoint } from '../utils/novel/storyState';
import { compileBook } from '../utils/novel/presentation';
import { rememberChapter } from '../utils/novel/memory';
import type { NovelLLM } from '../utils/novel/review';

function prepared(): NovelRun {
  const run = createRun(createBookSpec('Find the missing letter.', 3, { skipEditing: true, targetWordsPerChapter: 300 }), { provider: 'gemini', ollamaEndpoint: '', ollamaModel: '' });
  run.outline = 'Find the letter, read it, return it.';
  run.stage = 'writing';
  run.blueprint = { centralConflict: 'Find the letter', protagonistChange: 'Learn trust', endingPayoff: 'Return the letter', characters: {}, promises: [], chapters: [] };
  run.chapters = [1, 2, 3].map(number => ({ number, status: 'pending', repairAttempts: 0, versions: [], plan: { title: `Chapter ${number}`, summary: 'Planned but not yet established', detailedScenes: [{ sceneId: `s${number}`, participants: [], objective: 'Find the letter', outcome: 'Letter found' }] } })) as NovelRun['chapters'];
  return run;
}
const prose = 'Mara placed the silver key on the desk. She left the door open and walked into the rain.';
const model = () => vi.fn<NovelLLM>(async (_prompt, system) => {
  if (system.includes('story memory')) return JSON.stringify({ notes: [{ note: 'The key is on the desk.', quote: 'Mara placed the silver key on the desk.' }] });
  if (system.includes('title completed')) return JSON.stringify({ title: 'The Letter' });
  if (system.includes('next part')) return prose;
  throw new Error(`Unexpected call: ${system}`);
});

describe('direct manuscript lifecycle', () => {
  it('writes and remembers three chapters without any editor, exports and resumes unchanged', async () => {
    const run = prepared(), llm = model(), store = new MemoryRunStore();
    await new NovelEngine(llm, store).continue(run);
    expect(run.stage).toBe('complete');
    expect(llm.mock.calls).toHaveLength(7);
    expect(llm.mock.calls[2][0]).toContain('The key is on the desk.');
    expect(compileBook(run)).toContain(prose);
    expect(run.finalReview?.status).toBe('not_checked');
    expect(reconcileCheckpoint(run)).toBe(false);
    await new NovelEngine(llm, store).continue(run);
    expect(llm.mock.calls).toHaveLength(7);
  });
  it('does not turn an empty answer into a chapter and resumes at the failed chapter', async () => {
    const run = prepared(), llm = model();
    llm.mockImplementationOnce(async () => '');
    const engine = new NovelEngine(llm, new MemoryRunStore());
    await expect(engine.continue(run)).rejects.toThrow('empty prose');
    expect(run.chapters[0].versions).toHaveLength(0);
    await engine.continue(run);
    expect(run.stage).toBe('complete');
  });
  it('drops invented memory quotes and falls back to actual text', async () => {
    const run = prepared();
    const memory = await rememberChapter(run.chapters[0], { revision: 1, content: prose, reason: 'draft', createdAt: 0 }, async () => JSON.stringify({ notes: [{ note: 'Mara died', quote: 'An invented quotation' }] }));
    expect(memory.summary).toContain(prose);
    expect(memory.summary).not.toContain('Mara died');
  });
  it('applies requested editing to a copy and retains the original book', async () => {
    const run = prepared(), llm = model(), store = new MemoryRunStore();
    await new NovelEngine(llm, store).continue(run);
    const original = compileBook(run);
    run.editorial = { report: 'Change the weather', revisions: [1, 1, 1], proposals: [{ chapter: 1, instruction: 'Change rain to snow' }] };
    const editor: NovelLLM = async (p, s, o) => s.includes('edit a chapter') ? prose.replace('rain', 'snow') : llm(p, s, o);
    await new NovelEngine(editor, store).applyEditorial(run);
    expect(run.manuscriptHistory?.[0].content).toBe(original);
    expect(acceptedVersion(run.chapters[0])?.revision).toBe(2);
    expect(compileBook(run)).toContain('snow');
    expect(run.chapters[1].acceptedRevision).toBe(1);
  });
});
