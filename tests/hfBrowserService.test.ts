import { afterEach, expect, it, vi } from 'vitest';
import { generateHuggingFaceBrowserText } from '../services/hfBrowserService';

afterEach(() => vi.unstubAllGlobals());
const rows = (...events: object[]) => new Response(events.map(event => JSON.stringify(event) + '\n').join(''), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });

it('hands on the pieces of an answer as they come and returns the whole of it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => rows({ delta: 'Nora ' }, { restart: 'the provider answered 504' }, { delta: 'Nora ' }, { delta: 'waited.' }, { text: 'Nora waited.', metadata: { usage: { prompt_tokens: 3 } } })));
  const chunks: string[] = []; const restarts: string[] = []; let usage: any;
  expect(await generateHuggingFaceBrowserText('Hi', undefined, 100, 'org/model', 0.2, undefined, value => { usage = value; }, { onChunk: chunk => chunks.push(chunk), onRestart: why => { restarts.push(why); chunks.length = 0; } })).toBe('Nora waited.');
  expect(chunks).toEqual(['Nora ', 'waited.']);
  expect(restarts).toEqual(['the provider answered 504']);
  expect(usage.usage.prompt_tokens).toBe(3);
});
it('reports the error that ends a streamed answer, and an answer that never ended', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => rows({ delta: 'Half' }, { error: 'Hugging Face request failed [504] after several attempts. 504 Gateway Time-out' })));
  await expect(generateHuggingFaceBrowserText('Hi', undefined, 100, 'org/model')).rejects.toThrow('[504] after several attempts');
  vi.stubGlobal('fetch', vi.fn(async () => rows({ delta: 'Half' })));
  await expect(generateHuggingFaceBrowserText('Hi', undefined, 100, 'org/model')).rejects.toThrow('closed the answer before its end');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid Hugging Face request' }), { status: 400, headers: { 'content-type': 'application/json' } })));
  await expect(generateHuggingFaceBrowserText('Hi', undefined, 100, 'bad model')).rejects.toThrow('Invalid Hugging Face request');
});
