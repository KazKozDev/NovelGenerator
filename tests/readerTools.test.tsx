import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReaderTools, { speechChunks } from '../components/ReaderTools';
import BookDisplay from '../components/BookDisplay';
import { betaReaders, compareBooks, planSeries } from '../utils/novel/craft/readerTools';
import { readReaderMap } from '../utils/novel/craft/editorial';
import { sceneNeedsRepair, validateReceipt } from '../utils/novel/craft/observer';
import { buildProjectInput } from '../utils/generationSettings';

const input = { premise: 'SECRET PREMISE', genre: 'mystery', author_requirements: '', chapter_count: 3, target_total_words: 900 };
describe('reader and series tools', () => {
  it('calculates actual active questions and validates chronological setup/payoff evidence', () => {
    const chapters = [{ chapter: 1, text: 'The key vanished. She searched.' }, { chapter: 2, text: 'A letter arrived. The key was inside.' }];
    const map = { loops: [{ id: 'Q1', scale: 'macro', opened: { chapter: 1, quote: 'The key vanished.' }, progress: [{ chapter: 1, quote: 'She searched.' }], closed: { chapter: 2, quote: 'The key was inside.' } }], props: [{ name: 'key', appearances: [{ chapter: 1, quote: 'The key vanished.', role: 'setup' }, { chapter: 2, quote: 'The key was inside.', role: 'payoff' }] }] };
    const result = readReaderMap(map, chapters);
    expect(result.timeline.map(e => e.active.length)).toEqual([1, 0]);
    expect(() => readReaderMap({ ...map, loops: [{ ...map.loops[0], closed: map.loops[0].opened }] }, chapters)).toThrow('out of order');
    expect(() => readReaderMap(map, [{ chapter: 1, text: 'Revised text.' }])).toThrow('current manuscript');
  });
  it('does not skip scene repair for factual problems, unchanged polarity or repetition', () => {
    const text = 'word '.repeat(400);
    const receipt = { event: { status: 'enacted' as const, reason: 'yes', sources: ['SC1-p1'] }, tangibleActionEnacted: true, valueChargeTurned: true, facts: [], issues: [], wordCount: 400 };
    expect(validateReceipt(receipt, text, 'SC1')).toBe(receipt);
    expect(sceneNeedsRepair(receipt, text, 400)).toBe(false);
    expect(sceneNeedsRepair({ ...receipt, valueChargeTurned: false }, text, 400)).toBe(true);
    expect(sceneNeedsRepair({ ...receipt, isRepetitiveOrClichéd: true }, text, 400)).toBe(true);
    expect(sceneNeedsRepair({ ...receipt, issues: [{ reason: 'wrong key', sources: ['SC1-p1'] }] }, text, 400)).toBe(true);
    expect(() => validateReceipt({ ...receipt, event: { ...receipt.event, sources: ['SC1-p2'] } }, text, 'SC1')).toThrow('Invalid observer');
  });
  it('keeps reader simulations blind to the unrevealed premise and separates three perspectives', async () => {
    const prompts: string[] = [];
    const reviews = await betaReaders(input, [{ chapter: 1, text: 'A door opened.' }], async prompt => { prompts.push(prompt); return '{"issues":[]}'; }, () => {});
    expect(reviews).toHaveLength(3);
    expect(prompts.every(p => p.includes('A door opened.') && !p.includes('SECRET PREMISE'))).toBe(true);
    expect(new Set(reviews.map(r => r.focus)).size).toBe(3);
  });
  it('only plans a series when requested and requires an overarching and local ending', async () => {
    expect(await planSeries(input, async () => { throw new Error('should not call'); })).toBeUndefined();
    const result = await planSeries({ ...input, series_context: 'Volume 2. Nora already knows the truth.' }, async prompt => {
      expect(prompt).toContain('Nora already knows the truth.');
      return JSON.stringify({ establishedCanon: ['Nora knows'], macroEnding: 'Nora ends the conspiracy.', thisVolumeResolution: 'The hostage is rescued.', futureThreads: [], volumes: [{ volume: 2, conflict: 'rescue', finalState: 'hostage free' }] });
    });
    expect(result).toContain('hostage');
    await expect(planSeries({ ...input, series_context: 'series' }, async () => '{}')).rejects.toThrow('Incomplete');
  });
  it('compares books using supplied sources and rejects invented attributions', async () => {
    const contract = { ...input, comparable_books: 'Example Novel: 80000 words, 40 chapters. Source: publisher notes.' };
    const good = await compareBooks(contract, [{ chapter: 1, text: 'A short chapter.' }], async () => JSON.stringify({ comparisons: [{ title: 'Example Novel', sourceQuote: '80000 words, 40 chapters', observation: 'The supplied comparable has longer average chapters.' }], unknowns: ['turning point positions'] }));
    expect(good).toContain('unknowns');
    await expect(compareBooks(contract, [], async () => JSON.stringify({ comparisons: [{ title: 'Example Novel', sourceQuote: 'invented', observation: 'unsupported' }], unknowns: [] }))).rejects.toThrow('unsupported');
    const built = buildProjectInput('A story', 3, { targetWordsPerChapter: 300, seriesContext: 'Volume 2', comparableBooks: contract.comparable_books });
    expect(built.series_context).toBe('Volume 2');
    expect(built.comparable_books).toBe(contract.comparable_books);
  });
  it('chunks the entire book without dropping words and renders review and reader controls', () => {
    const text = '# Title\n\n' + Array.from({ length: 355 }, (_, i) => `word${i}`).join(' ');
    const chunks = speechChunks(text);
    expect(chunks).toHaveLength(3);
    expect(chunks.join(' ').split(' ')).toHaveLength(356);
    expect(chunks.at(-1)).toContain('word354');
    const html = renderToStaticMarkup(<ReaderTools text={text} />);
    expect(html).toContain('Read aloud');
    expect(html).not.toContain('Save reader feedback');
    expect(html).not.toContain('Target-reader feedback');
    const book = renderToStaticMarkup(<BookDisplay bookContent={text} metadataJson={JSON.stringify({ audit: { status: 'COMPLETE_WITH_WARNINGS', summary: 'Unresolved problem', findings: [{ severity: 'major', description: 'Missing key', evidence_refs: ['Chapter 1'] }] } })} onReset={() => {}} onEdit={() => {}} />);
    expect(book).toContain('Missing key');
    expect(book).toContain('Re-run Review');
    expect(book).toContain('Editorial Review');
  });
});
