import { describe, expect, it } from 'vitest';
import { safeToAutosave } from '../components/BookDisplay';

const book = '# Book\n\n## Chapter 1: One\n\nFirst.\n\n## Chapter 2: Two\n\nSecond.';

describe('manual edit autosave', () => {
  it('saves an edit that keeps every chapter in order with text', () => {
    expect(safeToAutosave(book, book.replace('Second.', 'Second, rewritten.'))).toBe(true);
    expect(safeToAutosave(book, book.replace('# Book', '# Another title'))).toBe(true);
  });

  it('holds an edit caught mid-way: a heading broken, a chapter emptied, dropped or out of order', () => {
    expect(safeToAutosave(book, book.replace('## Chapter 2: Two', '## Chap'))).toBe(false);
    expect(safeToAutosave(book, book.replace('Second.', ''))).toBe(false);
    expect(safeToAutosave(book, book.slice(0, book.indexOf('## Chapter 2')))).toBe(false);
    expect(safeToAutosave(book, book.replace('Chapter 1', 'Chapter 3'))).toBe(false);
    expect(safeToAutosave(book, '')).toBe(false);
  });
});
