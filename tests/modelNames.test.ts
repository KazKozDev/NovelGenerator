import { describe, it, expect } from 'vitest';
import { getFullModelName, buildGenerationModelsString } from '../utils/modelNames';
import { LLMProviderConfig } from '../types';

describe('utils/modelNames', () => {
  it('resolves full name for default Gemini provider', () => {
    const config: LLMProviderConfig = {
      provider: 'gemini',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(config)).toBe('Google Gemini 3.6 Flash (gemini-3.6-flash)');
  });

  it('resolves full name for explicit Gemini models', () => {
    const config: LLMProviderConfig = {
      provider: 'gemini',
      geminiModel: 'gemini-2.5-pro',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(config)).toBe('Google Gemini 2.5 Pro (gemini-2.5-pro)');
  });

  it('resolves full name for Anthropic models', () => {
    const configSonnet: LLMProviderConfig = {
      provider: 'anthropic',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(configSonnet)).toBe('Anthropic Claude 3.5 Sonnet (claude-3-5-sonnet-20241022)');

    const configOpus: LLMProviderConfig = {
      provider: 'anthropic',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(configOpus)).toBe('Anthropic Claude Opus 5.5 (claude-opus-5-5)');
  });

  it('resolves full name for Alibaba Qwen models', () => {
    const config: LLMProviderConfig = {
      provider: 'qwen',
      qwenModel: 'qwen-2.5-72b',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(config)).toBe('Alibaba Qwen 2.5 72B (qwen-2.5-72b)');
  });

  it('resolves full name for Ollama models', () => {
    const config: LLMProviderConfig = {
      provider: 'ollama',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(config)).toBe('Meta Llama 3.1 (llama3.1 via Ollama)');
  });

  it('resolves full name for OpenAI-compatible models', () => {
    const config: LLMProviderConfig = {
      provider: 'compatible',
      compatibleModel: 'gpt-4o',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(getFullModelName(config)).toBe('OpenAI GPT-4o (gpt-4o)');
  });

  it('builds combined generation models string for author and editor', () => {
    const author: LLMProviderConfig = {
      provider: 'gemini',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    const editor: LLMProviderConfig & { enabled: boolean } = {
      provider: 'anthropic',
      anthropicModel: 'claude-3-5-sonnet-20241022',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
      enabled: true,
    };

    const combined = buildGenerationModelsString(author, editor);
    expect(combined).toBe(
      'Author: Google Gemini 3.6 Flash (gemini-3.6-flash); Editor: Anthropic Claude 3.5 Sonnet (claude-3-5-sonnet-20241022)'
    );
  });

  it('builds generation models string with only author when editor is disabled or absent', () => {
    const author: LLMProviderConfig = {
      provider: 'gemini',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
    };
    expect(buildGenerationModelsString(author, undefined)).toBe(
      'Author: Google Gemini 3.6 Flash (gemini-3.6-flash)'
    );

    const disabledEditor: LLMProviderConfig & { enabled: boolean } = {
      provider: 'ollama',
      ollamaEndpoint: '/api/ollama',
      ollamaModel: 'llama3.1',
      enabled: false,
    };
    expect(buildGenerationModelsString(author, disabledEditor)).toBe(
      'Author: Google Gemini 3.6 Flash (gemini-3.6-flash)'
    );
  });
});
