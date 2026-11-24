import { describe, it, expect } from 'vitest';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { snapshotProject, restoreSnapshot } from '../utils/novel/v2/export';
import { CraftSession } from '../utils/novel/craft/state';
import { readBlindPrefix } from '../utils/novel/craft/blindContext';
import { recoverSavedBook } from '../utils/novel/craft/revision';
import { runCraftBook } from '../utils/novel/craft/craftOrchestrator';
import { authorArchitecture, scriptedAuthorLLM } from './fixtures/authorArchitecture';

const input = { premise: 'Nora exposes a forgery.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 1200 };
describe('author-state durability and deferred editing', () => {
  it('applies a full revision atomically and retains the source if staging is invalid', () => {
    const store = new MemoryProjectStore(); store.saveInput(input); store.saveManuscript(1, 'Original.');
    const draft = { version: 1 as const, input_key: 'book', clock: '', plan: '', chapters: [{ text: 'Replacement.', card: '', facts: '', reader: '' }], waiting: '', noticed: [], completed: false };
    expect(() => store.commitRevision([{ chapter: 1, text: '' }], draft)).toThrow('original manuscript retained');
    expect(store.manuscript()[0].text).toBe('Original.');
    store.commitRevision([{ chapter: 1, text: 'Replacement.' }], draft);
    expect(store.manuscript()[0].text).toBe('Replacement.');
    expect(store.loadAuthor()!.chapters[0].text).toBe('Replacement.');
    const restored = new MemoryProjectStore(); restoreSnapshot(restored, snapshotProject(store));
    expect(restored.manuscript()).toEqual(store.manuscript());
  });
  it('reads a long prefix incrementally and invalidates reader memory when actual prose changes', async () => {
    const session = new CraftSession({}, 'book', () => {}), prompts: string[] = [];
    const llm = async (prompt: string) => { prompts.push(prompt); return '{"hypotheses":[],"expectations":["Resolve the missing key."]}'; };
    const pages = ['FIRST ' + 'a'.repeat(25000), 'SECOND ' + 'b'.repeat(25000), 'THIRD ' + 'c'.repeat(25000)];
    await readBlindPrefix(pages, session, llm);
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).not.toContain('THIRD');
    expect(prompts[1]).not.toContain('FIRST');
    expect(prompts[1]).toContain('EARLIER READER MEMORY');
    const before = prompts.length; await readBlindPrefix(pages, session, llm); expect(prompts).toHaveLength(before);
    await readBlindPrefix([...pages, 'FOURTH paragraph.'], session, llm);
    expect(prompts.at(-1)).toContain('FOURTH');
    expect(prompts.at(-1)).not.toContain('FIRST');
    await readBlindPrefix(['Changed opening.', ...pages.slice(1)], session, llm);
    expect(prompts.slice(before + 1).some(p => p.includes('Changed opening.'))).toBe(true);
  });
  it('recovers old prose with evidence and keeps an invented off-page mechanism out of established canon', async () => {
    const session = new CraftSession({}, 'book', () => {});
    await expect(recoverSavedBook(input, [{ chapter: 1, text: 'The man was dead.' }], session, async () => JSON.stringify({ observations: [{ id: 'O1', kind: 'murder mechanism', chapter: 1, quote: 'She poisoned him.', statement: 'Poison established.' }], unknowns: [], proposals: [] }))).rejects.toThrow('exact saved-book evidence');
    expect(session.files['recovered-book.json']).toBeUndefined();
    await recoverSavedBook(input, [{ chapter: 1, text: 'The man was dead.' }], session, async () => JSON.stringify({ observations: [{ id: 'O1', kind: 'visible outcome', chapter: 1, quote: 'The man was dead.', statement: 'A death is shown.' }], unknowns: [{ question: 'How did he die?', missingEvidence: 'No mechanism on page.' }], proposals: [{ question: 'How to complete the mystery?', proposedAction: 'Plant physical evidence of an actual mechanism.', reason: 'Required by the promised solution.' }] }));
    const recovered = JSON.parse(session.files['recovered-book.json']);
    expect(recovered.observations[0].statement).toBe('A death is shown.');
    expect(recovered.unknowns).toHaveLength(1);
    expect(recovered.proposals).toHaveLength(1);
  });
  it('defers stylistic complaints instead of rewriting every discovery-draft scene', async () => {
    const store = new MemoryProjectStore(), base = scriptedAuthorLLM();
    let localRewrites = 0;
    await runCraftBook(input, store, async (prompt, system, options) => {
      if (options?.stage === 'craft-repair') localRewrites++;
      const response = await base(prompt, system, options);
      if (options?.stage === 'craft-observe') return JSON.stringify({ ...JSON.parse(response), isRepetitiveOrClichéd: true });
      return response;
    }, () => {});
    expect(localRewrites).toBe(0);
    expect(JSON.parse(store.loadAuthor()!.desk!.files['deferred-work.json'])).toHaveLength(3);
    expect(store.loadAuthor()!.desk!.files['revision-plan.json']).toBeTruthy();
  });
});
