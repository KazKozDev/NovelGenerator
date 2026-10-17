import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateCompatibleText, listCompatibleModels } from '../services/compatibleService';
import { generateText, generateTextStream, getStoredProviderConfig, getStoredValidatorConfig } from '../services/llmService';
import { providerTokenUsage } from '../utils/tokenUsage';

beforeEach(() => {
  vi.stubEnv('COMPATIBLE_BASE_URL', 'http://localhost:1234/v1');
  vi.stubEnv('COMPATIBLE_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sse = (finish = 'stop') => new Response(new ReadableStream({ start(c) {
  const e = new TextEncoder();
  const data = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: ' world' }, finish_reason: finish }], usage: { prompt_tokens: 12, completion_tokens: 4 } })}\n\ndata: [DONE]\n\n`;
  const bytes = e.encode(data); for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close();
} }), { headers: { 'content-type': 'text/event-stream' } });
it('streams split UTF-8 events and extracts usage using the configured server and optional key', async () => {
  const chunks: string[] = []; let metadata: unknown;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body); expect(body.model).toBe('my-model'); expect(body.stream).toBe(true); expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('Return JSON');
    expect(body.enable_thinking).toBeUndefined(); expect(body.reasoning_effort).toBeUndefined();
    return sse();
  }));
  expect(await generateCompatibleText('write', 'system', 1000, 'my-model', 0.4, { type: 'object' }, t => chunks.push(t), m => { metadata = m; })).toBe('Hello world');
  expect(chunks).toEqual(['Hello', ' world']);
  expect(providerTokenUsage('compatible', metadata)).toEqual({ input: 12, output: 4 });
});
it('supports keyless local APIs and nonstream JSON responses', async () => {
  vi.stubEnv('COMPATIBLE_API_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    expect(init.headers.Authorization).toBeUndefined();
    return Response.json({ choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }] });
  }));
  expect(await generateCompatibleText('write', '', 1000, 'local-model')).toBe('Answer');
});
it('lists arbitrary model IDs without provider prefixes', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => { expect(url).toBe('http://localhost:1234/v1/models'); return Response.json({ data: [{ id: 'vendor/model' }, { id: 'local' }, {}] }); }));
  expect(await listCompatibleModels()).toEqual(['vendor/model', 'local']);
});
it('rejects truncation and invalid endpoints without exposing upstream bodies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => sse('length')));
  await expect(generateCompatibleText('write', '', 1000, 'model')).rejects.toThrow('token limit');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('secret upstream error', { status: 401 })));
  await expect(generateCompatibleText('write', '', 1000, 'model')).rejects.toThrow('failed [401]');
  vi.stubEnv('COMPATIBLE_BASE_URL', 'https://user:password@example.com/v1');
  await expect(listCompatibleModels()).rejects.toThrow('without credentials');
});
it('dispatches both browser generation paths through the local gateway without sending the key', async () => {
  const config = { provider: 'compatible' as const, compatibleModel: 'test-model', ollamaEndpoint: '', ollamaModel: '' };
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    expect(url).toBe('/api/compatible'); const body = JSON.parse(init.body);
    expect(body.model).toBe('test-model'); expect(init.body).not.toContain('test-key');
    return new Response(JSON.stringify({ delta: 'Answer' }) + '\n' + JSON.stringify({ text: 'Answer', metadata: { usage: { prompt_tokens: 2, completion_tokens: 1 } } }) + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
  }));
  const chunks: string[] = [];
  expect(await generateText('write', '', undefined, 0.4, undefined, undefined, config)).toBe('Answer');
  expect(await generateTextStream('write', t => chunks.push(t), '', 0.4, config)).toBe('Answer');
  expect(chunks).toEqual(['Answer']);
});
it('restores compatible author and reader model selections', () => {
  const value = JSON.stringify({ enabled: true, provider: 'compatible', compatibleModel: 'chosen-model' });
  vi.stubGlobal('window', {}); vi.stubGlobal('localStorage', { getItem: () => value });
  expect(getStoredProviderConfig().provider).toBe('compatible');
  expect(getStoredValidatorConfig()?.compatibleModel).toBe('chosen-model');
});

it('runs the browser-to-local-gateway-to-upstream path with streamed output', async () => {
  const { createServer } = await import('node:http');
  const { compatibleDevPlugin } = await import('../services/compatibleDevPlugin');
  const { gatewayText } = await import('../services/hfBrowserService');
  const handlers: { path: string; fn: any }[] = [];
  const plugin = compatibleDevPlugin();
  (plugin.configureServer as any)({ middlewares: { use: (path: string, fn: any) => handlers.push({ path, fn }) } });
  const server = createServer((req, res) => {
    const handler = handlers.find(h => h.path === req.url);
    if (handler) handler.fn(req, res); else { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const actualFetch = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    if (url.startsWith('/api/')) return actualFetch(root + url, { ...init, headers: { ...init.headers, Origin: root } });
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    return sse();
  }));
  try {
    const chunks: string[] = [];
    const result = await gatewayText('/api/compatible', 'API', { prompt: 'hello', model: 'custom-model' }, undefined, { onChunk: c => chunks.push(c) });
    expect(result).toBe('Hello world'); expect(chunks.join('')).toBe(result);
    const denied = await actualFetch(root + '/api/compatible', { method: 'POST', headers: { Origin: 'https://elsewhere.test' }, body: '{}' });
    expect(denied.status).toBe(403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
