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

  it('parses Russian chapter headings with dots and colons', () => {
    const content = '# Моя книга\n\n## Глава 1. Первая глава\n\nТекст 1.\n\n## Глава 2: Вторая глава\n\nТекст 2.';
    const chapters = parseBookChapters(content);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].num).toBe(1);
    expect(chapters[0].title).toBe('Первая глава');
    expect(chapters[0].content).toBe('Текст 1.');
    expect(chapters[1].num).toBe(2);
    expect(chapters[1].title).toBe('Вторая глава');
    expect(chapters[1].content).toBe('Текст 2.');
  });

  it('falls back to single chapter if text has no chapter headings', () => {
    const raw = '# Название\n\nПросто текст книги без явного деления на главы.';
    const chapters = parseBookChapters(raw);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].num).toBe(1);
    expect(chapters[0].content).toBe('Просто текст книги без явного деления на главы.');
  });

  it('removes pruned chapters when editing reduces chapter count', () => {
    const store = new MemoryProjectStore();
    store.saveManuscript(1, 'Ch 1');
    store.saveManuscript(2, 'Ch 2');
    store.saveManuscript(3, 'Ch 3');

    const edited = '# Book\n\n## Chapter 1\n\nNew 1\n\n## Chapter 2\n\nNew 2';
    const parsed = parseBookChapters(edited);
    const parsedNums = new Set(parsed.map(c => c.num));
    for (const c of store.manuscript()) {
      if (!parsedNums.has(c.chapter)) {
        store.removeManuscript(c.chapter);
      }
    }
    for (const c of parsed) {
      store.saveManuscript(c.num, c.content);
    }
    expect(store.manuscript()).toHaveLength(2);
    expect(store.manuscript().map(c => c.chapter)).toEqual([1, 2]);
  });
});
