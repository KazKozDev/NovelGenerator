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
    expect(payload.system).toBe('You are a master novelist');
    expect(payload.stream).toBe(false);
    expect(payload.format).toBe('json');
    expect(payload.options?.temperature).toBe(0.5);
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
});
