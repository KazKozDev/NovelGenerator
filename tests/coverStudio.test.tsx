import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COVER_FORMATS, cropRect, fitText, textLayout, wrapLines } from '../utils/cover/formats';
import { buildCoverPromptRequest, masterPrompt } from '../utils/cover/coverPrompt';
import { generateGeminiImage } from '../services/geminiDevPlugin';
import PromptBookWorkspace from '../components/PromptBookWorkspace';
import type { PromptBook } from '../utils/novel/promptBook';

// Each character is 10 units wide at size 10.
const measureAt = (size: number, text: string) => text.length * size;

describe('cover formats', () => {
  it('cuts the largest frame of the format around the focus, held inside the master', () => {
    expect(cropRect(2000, 3000, 1600, 2560, { x: 0.5, y: 0.5 })).toEqual({ x: 63, y: 0, w: 1875, h: 3000 });
    expect(cropRect(2000, 3000, 3000, 3000, { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 500, w: 2000, h: 2000 });
    expect(cropRect(2000, 3000, 3000, 3000, { x: 0.5, y: 0 })).toEqual({ x: 0, y: 0, w: 2000, h: 2000 });
    expect(cropRect(2000, 3000, 3000, 3000, { x: 0.5, y: 1 })).toEqual({ x: 0, y: 1000, w: 2000, h: 2000 });
  });

  it('wraps words into lines and shrinks the title until it fits', () => {
    expect(wrapLines('The Thursday Room', 90, t => t.length * 10)).toEqual(['The', 'Thursday', 'Room']);
    const fit = fitText('THE THURSDAY ROOM', 1000, 2, 100, 20, measureAt);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.lines.every(line => measureAt(fit.size, line) <= 1000)).toBe(true);
  });

  it('keeps the author above the audiobook badge and offers the three formats', () => {
    expect(COVER_FORMATS.map(f => [f.id, f.width, f.height])).toEqual([['ebook', 1600, 2560], ['audio', 3000, 3000], ['post', 1080, 1350]]);
    expect(textLayout(COVER_FORMATS[1]).authorBottom).toBeGreaterThan(0.14);
    expect(textLayout(COVER_FORMATS[0]).authorBottom).toBe(0.06);
  });
});

describe('cover prompt', () => {
  it('asks for a picture from the book, and adds the no-lettering rules in code', () => {
    const { prompt, system } = buildCoverPromptRequest({ title: 'The Thursday Room', genre: 'erotic thriller', premise: 'A counselor and a hotel room.', excerpt: 'Room 412 held the heat.' });
    expect(prompt).toContain('TITLE: The Thursday Room');
    expect(prompt).toContain('OPENING OF THE BOOK:\nRoom 412 held the heat.');
    expect(system).toContain('Do not ask for any text');
    expect(masterPrompt('A window in a hotel room.')).toMatch(/^A window in a hotel room\.\n\n.*No text, no letters/s);
  });
});

describe('gemini image request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for one 2:3 4K image and returns its data', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateGeminiImage('key', { prompt: 'A window', model: 'gemini-3.1-flash-image' })).toEqual({ data: 'AAAA', mimeType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.1-flash-image:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
    expect(JSON.parse(String(init.body)).generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3', imageSize: '4K' } });
  });

  it('refuses an unknown model and reports a missing image', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateGeminiImage('key', { prompt: 'x', model: 'something-else' })).rejects.toThrow('Gemini returned no image (SAFETY).');
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain('/models/gemini-3-pro-image:generateContent');
  });
});

describe('cover stage', () => {
  it('shows the fourth stage and opens the cover studio', () => {
    const state: PromptBook = { version: 1, brief: { input: { premise: 'Save a log', chapter_count: 2, target_total_words: 1200, genre: 'thriller', author_requirements: '' }, settings: {} }, phase: 'ready', revision: 1, prompts: [], blueprint: { title: 'The Log' } as any, workspaceStage: 'cover', updatedAt: '' };
    const html = renderToStaticMarkup(<PromptBookWorkspace value={state} busy={false} onContinue={vi.fn()} onSaveBlueprint={vi.fn()} onSavePrompt={vi.fn()} onExport={vi.fn()} onSettings={vi.fn()} />);
    expect(html).toContain('4. Cover');
    expect(html).toContain('Write from the book');
    expect(html).toContain('Generate master');
    expect(html).not.toContain('Chapter prompts');
  });
});
