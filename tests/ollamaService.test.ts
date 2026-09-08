import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOllamaModels, parseOllamaTagsResponse, buildOllamaGeneratePayload } from '../services/ollamaService';

describe('ollamaService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parseOllamaTagsResponse correctly extracts model names', () => {
    const sampleResponse = {
      models: [
        { name: 'llama3.1:latest', size: 4700000000 },
        { name: 'qwen2.5:7b', size: 4500000000 },
        { name: 'mistral:latest', size: 4100000000 }
      ]
    };

    const models = parseOllamaTagsResponse(sampleResponse);
    expect(models).toEqual(['llama3.1:latest', 'qwen2.5:7b', 'mistral:latest']);
  });

  it('parseOllamaTagsResponse handles empty or malformed payload gracefully', () => {
    expect(parseOllamaTagsResponse(null)).toEqual([]);
    expect(parseOllamaTagsResponse({})).toEqual([]);
    expect(parseOllamaTagsResponse({ models: [] })).toEqual([]);
  });

  it('buildOllamaGeneratePayload formats prompt, system and json schema option correctly', () => {
    const payload = buildOllamaGeneratePayload({
      model: 'llama3.1',
      prompt: 'Write a chapter outline',
      system: 'You are a master novelist',
      temperature: 0.5,
      isJson: true
    });

    expect(payload.model).toBe('llama3.1');
    expect(payload.prompt).toBe('Write a chapter outline');
    expect(payload.system).toContain('You are a master novelist');
    expect(payload.stream).toBe(false);
    expect(payload.think).toBe(false);
    expect(payload.system).toContain('Do not output thinking');
    expect(payload.format).toBe('json');
    expect(payload.options?.temperature).toBe(0.5);
  });

  it('honours a role that enables thinking and stops telling that model to suppress reasoning', () => {
    const payload = buildOllamaGeneratePayload({
      model: 'gemma4:31b-cloud',
      think: true,
      prompt: 'Review this chapter',
      system: 'You are a rigorous editor',
      isJson: true
    });

    expect(payload.think).toBe(true);
    expect(payload.system).toBe('You are a rigorous editor');
    expect(payload.system).not.toContain('Do not output thinking');
  });

  it('fetchOllamaModels calls /api/tags and returns model list', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3.1:8b' }]
      })
    });
    globalThis.fetch = fakeFetch as any;

    const models = await fetchOllamaModels('/api/ollama');
    expect(fakeFetch).toHaveBeenCalledWith('/api/ollama/api/tags', expect.any(Object));
    expect(models).toEqual(['llama3.1:8b']);
  });

  it('generateOllamaText disables GLM thinking and ignores any unsolicited thinking channel', async () => {
    const { generateOllamaText } = await import('../services/ollamaService');
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: 'Here is the direct story prose without reasoning.',
          thinking: 'Let me think about how to write this story...'
        },
        done: true
      })
    });
    globalThis.fetch = fakeFetch as any;

    const result = await generateOllamaText(
      'Write chapter 1',
      'System directive',
      undefined,
      0.7,
      'glm-5.3-flash:cloud',
      '/api/ollama'
    );

    expect(fakeFetch).toHaveBeenCalledWith('/api/ollama/api/chat', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"think":false')
    }));
    expect(result).toBe('Here is the direct story prose without reasoning.');
    expect(result).not.toContain('Let me think');
  });

  it('lets a validator role think while keeping that reasoning out of the returned text', async () => {
    const { generateOllamaText } = await import('../services/ollamaService');
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '{"issues":[]}', thinking: 'Checking continuity step by step...' },
        done: true,
      }),
    });
    globalThis.fetch = fakeFetch as any;

    const result = await generateOllamaText('Review chapter 1', 'You are a rigorous editor', undefined, 0.2, 'gemma4:31b-cloud', '/api/ollama', undefined, undefined, undefined, true);

    const body = JSON.parse(fakeFetch.mock.calls[0][1].body);
    expect(body.think).toBe(true);
    expect(body.messages[0].content).not.toContain('Do not output reasoning');
    expect(result).toBe('{"issues":[]}');
    expect(result).not.toContain('step by step');
  });
});
