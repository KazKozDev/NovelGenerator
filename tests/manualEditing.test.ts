import { describe, it, expect } from 'vitest';
import { parseBookChapters, assembleManuscript } from '../utils/novel/manuscript';
import { MemoryProjectStore } from '../utils/novel/v2/store';

describe('Manual manuscript editing', () => {
  it('parses edited markdown content and updates store chapters', () => {
    const store = new MemoryProjectStore();
    store.saveManuscript(1, 'Initial text 1');
    store.saveManuscript(2, 'Initial text 2');

    const editedContent = '# My Book\n\n## Chapter 1\n\nManually updated text 1.\n\n## Chapter 2\n\nManually updated text 2.';
    const chapters = parseBookChapters(editedContent);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].content).toBe('Manually updated text 1.');
    expect(chapters[1].content).toBe('Manually updated text 2.');

    for (const c of chapters) {
      store.saveManuscript(c.num, c.content);
    }
    const current = store.manuscript();
    expect(current[0].text).toBe('Manually updated text 1.');
    expect(current[1].text).toBe('Manually updated text 2.');
    expect(assembleManuscript(current, 'My Book')).toBe(editedContent);
  });
});
