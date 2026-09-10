import { describe, expect, it, vi, beforeEach } from 'vitest';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe('Editor model configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { console }); // terminalLogger reads window.console when a window exists
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('carries the chosen editor model and its thinking setting to the engine', async () => {
    const { getStoredValidatorConfig, saveStoredValidatorConfig } = await import('../services/llmService');
    saveStoredValidatorConfig({ enabled: true, provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'gemma4:31b-cloud', think: true });
    expect(getStoredValidatorConfig()).toEqual({ provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'gemma4:31b-cloud', think: true });
  });

  it('reports no editor when the author has not chosen one, so the writer is not silently trusted as its own judge', async () => {
    const { getStoredValidatorConfig, saveStoredValidatorConfig } = await import('../services/llmService');
    expect(getStoredValidatorConfig()).toBeUndefined();
    saveStoredValidatorConfig({ enabled: true, provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'granite4.2:8b', think: false });
    saveStoredValidatorConfig(undefined);
    expect(getStoredValidatorConfig()).toBeUndefined();
  });

  it('never returns thinking as enabled unless it was stored that way', async () => {
    const { getStoredValidatorConfig, saveStoredValidatorConfig } = await import('../services/llmService');
    saveStoredValidatorConfig({ enabled: true, provider: 'gemini', ollamaEndpoint: '/api/ollama', ollamaModel: 'llama3.1' });
    expect(getStoredValidatorConfig()?.think).toBe(false);
  });
});
