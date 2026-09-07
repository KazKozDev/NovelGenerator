/**
 * Unified LLM Gateway
 * Dispatches requests to either Google Gemini or local Ollama based on user configuration.
 */

import { LLMProviderConfig } from '../types';
import { generateGeminiText, generateGeminiTextStream } from './geminiService';
import { generateOllamaText, generateOllamaTextStream, DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL } from './ollamaService';

const LLM_STORAGE_KEY = 'novelGenerator_llm_config';

export const DEFAULT_LLM_CONFIG: LLMProviderConfig = {
  provider: 'gemini',
  ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
  ollamaModel: DEFAULT_OLLAMA_MODEL
};

export function getStoredProviderConfig(): LLMProviderConfig {
  if (typeof window === 'undefined') return DEFAULT_LLM_CONFIG;
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY);
    if (!raw) return DEFAULT_LLM_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider === 'ollama' ? 'ollama' : 'gemini',
      ollamaEndpoint: parsed.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT,
      ollamaModel: parsed.ollamaModel || DEFAULT_OLLAMA_MODEL
    };
  } catch {
    return DEFAULT_LLM_CONFIG;
  }
}

export function saveStoredProviderConfig(config: LLMProviderConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save LLM provider config to localStorage:', err);
  }
}

/**
 * Unified text generation dispatch
 */
export async function generateText(
  prompt: string,
  systemInstruction?: string,
  schema?: object,
  temperature: number = 0.7,
  topP?: number,
  topK?: number,
  overrideConfig?: LLMProviderConfig
): Promise<string> {
  const config = overrideConfig || getStoredProviderConfig();

  if (config.provider === 'ollama') {
    return generateOllamaText(
      prompt,
      systemInstruction,
      schema,
      temperature,
      config.ollamaModel,
      config.ollamaEndpoint
    );
  }

  // Default to Gemini
  return generateGeminiText(prompt, systemInstruction, schema, temperature, topP, topK);
}

/**
 * Unified stream text generation dispatch
 */
export async function generateTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  temperature: number = 0.7,
  overrideConfig?: LLMProviderConfig
): Promise<string> {
  const config = overrideConfig || getStoredProviderConfig();

  if (config.provider === 'ollama') {
    return generateOllamaTextStream(
      prompt,
      onChunk,
      systemInstruction,
      config.ollamaModel,
      config.ollamaEndpoint
    );
  }

  // Default to Gemini
  return generateGeminiTextStream(prompt, onChunk, systemInstruction, temperature);
}
