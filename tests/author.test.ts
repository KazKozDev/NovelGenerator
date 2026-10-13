import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { cleanChapter, wornPhrases } from '../utils/novel/v3/author';

const input = { premise: 'Nora hides a notebook.', author_requirements: 'Voice: third-limited.', genre: 'thriller', chapter_count: 4, target_total_words: 1200, planning_version: 2 as const };

describe('the author at the desk', () => {
  it('writes a new book at the desk', async () => {
    const store = new MemoryProjectStore(); const stages: string[] = [];
    const result = await new Orchestrator(store).runBook(input, async (_prompt, _system, options) => { stages.push(options?.stage || ''); throw new Error('stop'); });
    expect(result.status).toBe('FAILED');
    expect(stages).toEqual(['author-step']);
    expect(store.loadInput()!.generation_mode).toBe('author');
    expect(store.runLog().some(entry => entry.detail.includes('The author is at its desk'))).toBe(true);
  });

  it('counts a phrase as worn only from its third use', () => {
    expect(wornPhrases(['a glass of ice water going to water', 'a glass of ice water going to water'])).toEqual([]);
    expect(wornPhrases(['a glass of ice water going warm', 'a glass of ice water going warm', 'a glass of ice water going warm'])[0]).toContain('(3 times)');
  });

  it('leaves the author\'s notes to itself out of the chapter', () => {
    expect(cleanChapter('She went in, and closed the door behind her, and said nothing at all.\n\n---\n\n*[Record: see keeper entry for chapter 1.]*')).toBe('She went in, and closed the door behind her, and said nothing at all.');
    expect(cleanChapter('She read the sign.\n\n[CLOSED UNTIL FURTHER NOTICE]')).toBe('She read the sign.\n\n[CLOSED UNTIL FURTHER NOTICE]');
  });
});
