import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateOllamaText, readOllamaCompletion } from '../services/ollamaService';

function stream(parts: string[]) {
  return new Response(new ReadableStream({ start(controller) {
    const encoder = new TextEncoder();
    for (const part of parts) controller.enqueue(encoder.encode(part));
    controller.close();
  } }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Ollama streaming completion contract', () => {
  it('preserves fragmented frames and a final record without a newline', async () => {
    const response = stream(['{"message":{"content":"Ве', 'ра"},"done":false}\n', '{"message":{"content":" читала."},"done":true,"done_reason":"stop"}']);
    expect(await readOllamaCompletion(response)).toBe('Вера читала.');
  });
  it('discards separate thinking frames before the final JSON', async () => {
    expect(await readOllamaCompletion(stream([
      '{"message":{"thinking":"private model trace"},"done":false}\n',
      '{"message":{"content":"{\\"issues\\":[]}"},"done":true}',
    ]))).toBe('{"issues":[]}');
  });
  it('rejects incomplete, errored, malformed and token-limited streams', async () => {
    for (const body of [
      '{"message":{"content":"partial prose"},"done":false}\n',
      '{"error":"upstream overloaded"}\n',
      '{"message":{"content":"partial"},"done":true,"done_reason":"length"}',
      '{broken}\n',
    ]) await expect(readOllamaCompletion(stream([body]))).rejects.toThrow();
  });
  it('does not duplicate a request on server errors or stream failure', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('overloaded', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(generateOllamaText('prompt')).rejects.toThrow(/503/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('uses generate fallback only for an unsupported chat endpoint, retaining the terminal frame', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(stream(['{"response":"Finished prose.","done":true}']));
    vi.stubGlobal('fetch', fetch);
    expect(await generateOllamaText('prompt')).toBe('Finished prose.');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('/api/generate');
    for (const [, request] of fetch.mock.calls) expect(JSON.parse(request.body).think).toBe(false);
  });

  it('sends the actual JSON schema with think disabled', async () => {
    const fetch = vi.fn().mockResolvedValue(stream(['{"message":{"content":"{\\"issues\\":[]}"},"done":true}']));
    vi.stubGlobal('fetch', fetch);
    const schema = { type: 'object', required: ['issues'], properties: { issues: { type: 'array' } } };
    await generateOllamaText('review', 'editor', schema);
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.format).toEqual(schema);
    expect(payload.think).toBe(false);
  });
});
