import { describe, it, expect } from 'vitest';
import { CraftSession } from '../utils/novel/craft/state';
import { wholeBookContext } from '../utils/novel/craft/manuscriptContext';
import { reviewManuscript } from '../utils/novel/craft/editorial';
import { betaReaders } from '../utils/novel/craft/readerTools';

const input = { premise: 'Private author mechanism must never reach blind readers.', genre: 'mystery', author_requirements: '', chapter_count: 2, target_total_words: 14000 };
const chapters = [{ chapter: 1, text: 'The first lock was broken. ' + 'A'.repeat(35000) }, { chapter: 2, text: 'The second lock was intact. ' + 'B'.repeat(35000) }];
describe('bounded whole-book author context', () => {
  it('reads exact chapter revisions into evidence digests once and retains valid source quotes for global work', async () => {
    const session = new CraftSession({}, 'book', () => {}); let calls = 0;
    const llm = async (prompt: string) => {
      calls++; const chapter = prompt.includes('"chapter":1') ? 1 : 2;
      return JSON.stringify({ chapter, synopsis: `Chapter ${chapter} changes the investigation.`, evidence: [{ id: `CH${chapter}-E1`, quote: chapters[chapter - 1].text.split('. ')[0] + '.', meaning: 'Physical access differs.' }], openQuestions: ['Who opened the first lock?'] });
    };
    const context = await wholeBookContext(chapters, session, llm);
    expect(calls).toBe(2);
    expect(context).toContain('The first lock was broken.');
    expect(context).not.toContain('A'.repeat(100));
    await wholeBookContext(chapters, session, llm); expect(calls).toBe(2);
    const review = await reviewManuscript(input, chapters, 'developmental', async prompt => {
      expect(prompt).toContain('Every chapter below was separately read');
      expect(prompt).not.toContain('A'.repeat(100));
      return JSON.stringify({ issues: [{ category: 'access', severity: 'major', reason: 'The different access needs an enacted explanation.', evidence: [{ chapter: 2, quote: 'The second lock was intact.' }] }] });
    }, context);
    expect(review.issues).toHaveLength(1); expect(review.failures).toEqual([]);
  });
  it('lets each blind reader consume long prose in order without author context or later chapters', async () => {
    const session = new CraftSession({}, 'book', () => {}); const prompts: string[] = [];
    const llm = async (prompt: string, system: string) => {
      prompts.push(prompt);
      expect(system).toContain('blind reader');
      expect(prompt).not.toContain(input.premise);
      const isSecond = prompt.includes('"chapter":2,"text"');
      if (isSecond) {
        expect(prompt).not.toContain('A'.repeat(100));
        expect(prompt).toContain('The first lock was broken.');
      } else expect(prompt).not.toContain('The second lock was intact.');
      return JSON.stringify({ issues: [], readerMemory: isSecond ? 'Both locks now have an explained sequence.' : 'The first lock was broken. Who had access?' });
    };
    const reviews = await betaReaders(input, chapters, llm, () => {}, session);
    expect(prompts).toHaveLength(6);
    expect(reviews.every(r => !r.failures.length)).toBe(true);
    await betaReaders(input, chapters, llm, () => {}, session);
    expect(prompts).toHaveLength(6);
  });
});
