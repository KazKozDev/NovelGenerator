import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { assembleManuscript, normalizeChapterBody, parseBookChapters, repairStoredFormatting } from '../utils/novel/manuscript';
import { buildEpub } from '../utils/exportUtils';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import SaveBook from '../components/SaveBook';
import ReaderTools from '../components/ReaderTools';
import { authorKey } from '../utils/novel/author';

describe('canonical chapter structure', () => {
  it('removes duplicate structural labels while preserving prose and intentional repeated paragraphs', () => {
    const paragraph = 'She refused. '.repeat(12).trim();
    const body = normalizeChapterBody(`## Chapter 1\n\n${paragraph}\n\n**Chapter 1**\n\n${paragraph}`, 1);
    expect(body).toBe(`${paragraph}\n\n${paragraph}`);
    expect(normalizeChapterBody('"Chapter 1," she said.\n\n> Chapter 2\n\nWords.', 1)).toContain('> Chapter 2');
  });
  it('assembles the exact requested five chapters once each, without duplicating draft labels', () => {
    const chapters = Array.from({ length: 5 }, (_, i) => ({ chapter: i + 1, text: `## Chapter ${i + 1}\n\nBody ${i + 1}.` }));
    const book = assembleManuscript(chapters, 'The Key');
    expect(book.match(/^## Chapter /gm)).toHaveLength(5);
    expect(parseBookChapters(book).map(c => c.num)).toEqual([1, 2, 3, 4, 5]);
    expect(book).not.toContain('Chapter 1: Chapter 1');
  });
  it('reads headers with and without subtitles and merges repeated headers for the same chapter', () => {
    const result = parseBookChapters('# Book\n\n## Chapter 1\n\n## Chapter 1\n\nFirst.\n\n## Chapter 2: The Letter\n\nSecond.');
    expect(result).toEqual([{ num: 1, title: '', content: 'First.' }, { num: 2, title: 'The Letter', content: 'Second.' }]);
  });
  it('migrates a saved book once and preserves its original text and report', () => {
    const store = new MemoryProjectStore();
    const input = { premise: 'Story', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 300 };
    const original = '## Chapter 1\n\nNora opened the door.';
    store.saveManuscript(1, original);
    store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [{ text: original, card: '', facts: '', reader: '' }], waiting: '', noticed: [], completed: true, desk: { files: { 'chapter-1.md': original }, answers: [], journal: [], step: 0, spent: 0, budget: 0, finished: true } });
    repairStoredFormatting(store);
    expect(store.manuscript()[0].text).toBe('Nora opened the door.');
    const files = store.loadAuthor()!.desk!.files;
    const backups = Object.keys(files).filter(n => n.startsWith('formatting-source-'));
    expect(backups).toHaveLength(1);
    expect(JSON.parse(files[backups[0]]).chapters[0].text).toBe(original);
    repairStoredFormatting(store);
    expect(Object.keys(store.loadAuthor()!.desk!.files).filter(n => n.startsWith('formatting-source-'))).toHaveLength(1);
  });
  it('exports all five EPUB chapters with one heading each, readable prose and XML-safe metadata', async () => {
    const book = assembleManuscript(Array.from({ length: 5 }, (_, i) => ({ chapter: i + 1, text: `## Chapter ${i + 1}\n\nBody ${i + 1}.` })), 'Keys & Lies');
    const zip = await JSZip.loadAsync(await (await buildEpub(book, { author: 'A & B' })).arrayBuffer());
    const chapters = Object.keys(zip.files).filter(n => /OEBPS\/chapter\d+\.xhtml$/.test(n));
    expect(chapters).toHaveLength(5);
    for (let i = 1; i <= 5; i++) {
      const text = await zip.file(`OEBPS/chapter${i}.xhtml`)!.async('string');
      expect(text.match(/<h2>/g)).toHaveLength(1);
      expect(text).toContain(`<h2>Chapter ${i}</h2>`);
      expect(text).toContain(`Body ${i}.`);
      expect(text).not.toContain(`Chapter ${i}: Chapter ${i}`);
    }
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain('Keys &amp; Lies');
  });
  it('has no human approval, reader submission or author-confirmation form in the delivery controls', () => {
    const html = renderToStaticMarkup(<><SaveBook content="# Book\n\n## Chapter 1\n\nText." /><ReaderTools text="Text." /></>);
    expect(html).not.toMatch(/<form|<dialog|Author Name|Save reader feedback|Target-reader feedback/);
    expect(html).toContain('Export book');
  });
});
