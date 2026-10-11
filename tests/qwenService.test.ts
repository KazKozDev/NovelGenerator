import { afterEach, expect, it, vi } from 'vitest';
import { generateQwenText } from '../services/qwenService';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setup(reason = 'stop') {
  vi.stubEnv('QWEN_API_KEY', 'test-secret');
  vi.stubEnv('QWEN_BASE_URL', 'https://example.test/compatible-mode/v1');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: reason, message: { content: 'Answer' } }], usage: { total_tokens: 5 } })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('uses the workspace endpoint with thinking disabled and reports usage', async () => {
  const fetch = setup(); const metadata = vi.fn();
  expect(await generateQwenText('prompt', 'system', 1234, 'qwen3.8-flash', 0.2, metadata)).toBe('Answer');
  expect(fetch.mock.calls[0][0]).toBe('https://example.test/compatible-mode/v1/chat/completions');
  const payload = JSON.parse(fetch.mock.calls[0][1].body);
  expect(payload).toMatchObject({ model: 'qwen3.8-flash', enable_thinking: false, max_tokens: 1234 });
  expect(metadata).toHaveBeenCalledWith({ finish_reason: 'stop', usage: { total_tokens: 5 } });
});
it('rejects truncated and abnormal responses', async () => {
  for (const reason of ['length', 'content_filter']) {
    setup(reason);
    await expect(generateQwenText('prompt')).rejects.toThrow();
  }
});
it('sends the complete schema as instructions with JSON object mode', async () => {
  const fetch = setup();
  const schema = { type: 'object', required: ['resistance'], properties: { resistance: { type: 'string' } } };
  await generateQwenText('Return JSON', 'system', 256, 'qwen3.8-flash', 0.2, undefined, schema);
  const payload = JSON.parse(fetch.mock.calls[0][1].body);
  expect(payload.response_format).toEqual({ type: 'json_object' });
  expect(payload.messages[0].content).toContain(JSON.stringify(schema));
});
it('does not expose upstream response contents on failure', async () => {
  setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive server error', { status: 401 })));
  await expect(generateQwenText('prompt')).rejects.toThrow('Qwen API request failed [401].');
});
