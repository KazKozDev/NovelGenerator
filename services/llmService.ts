/**
 * Unified LLM Gateway
 * Dispatches requests to either Google Gemini or local Ollama based on user configuration.
 */

import { LLMProviderConfig } from '../types';
import { generateGeminiText, generateGeminiTextStream } from './geminiService';
import { generateOllamaText, generateOllamaTextStream, DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL } from './ollamaService';
import { generateQwenBrowserText } from './qwenBrowserService';
import { providerTokenUsage, type TokenUsage } from '../utils/tokenUsage';
import { logToTerminal } from '../utils/terminalLogger';

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
      provider: parsed.provider === 'qwen' ? 'qwen' : parsed.provider === 'ollama' ? 'ollama' : 'gemini',
      ollamaEndpoint: parsed.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT,
      ollamaModel: parsed.ollamaModel || DEFAULT_OLLAMA_MODEL,
      ...(typeof parsed.qwenModel === 'string' && parsed.qwenModel.trim() ? { qwenModel: parsed.qwenModel.trim() } : {}),
      // Only present when the author typed one: stored configs keep their exact shape otherwise.
      ...(typeof parsed.geminiModel === 'string' && parsed.geminiModel.trim() ? { geminiModel: parsed.geminiModel.trim() } : {}),
    };
  } catch {
    return DEFAULT_LLM_CONFIG;
  }
}

const VALIDATOR_STORAGE_KEY = 'novelGenerator_validator_config';

/**
 * The editor model, when the author wants one distinct from the writer. Undefined means the writer
 * also judges its own prose, which is the weakest configuration and never the recommended one.
 */
export function getStoredValidatorConfig(): LLMProviderConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(VALIDATOR_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.enabled === false) return undefined;
    return {
      provider: parsed.provider === 'qwen' ? 'qwen' : parsed.provider === 'ollama' ? 'ollama' : 'gemini',
      ollamaEndpoint: parsed.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT,
      ollamaModel: parsed.ollamaModel || DEFAULT_OLLAMA_MODEL,
      ...(typeof parsed.qwenModel === 'string' && parsed.qwenModel.trim() ? { qwenModel: parsed.qwenModel.trim() } : {}),
      ...(typeof parsed.geminiModel === 'string' && parsed.geminiModel.trim() ? { geminiModel: parsed.geminiModel.trim() } : {}),
    };
  } catch {
    return undefined;
  }
}

export function saveStoredValidatorConfig(config: (LLMProviderConfig & { enabled: boolean }) | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (!config) localStorage.removeItem(VALIDATOR_STORAGE_KEY);
    else localStorage.setItem(VALIDATOR_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save editor model config to localStorage:', err);
  }
}

const SECOND_WRITER_STORAGE_KEY = 'novelGenerator_second_writer_config';

/**
 * A second writer, when the author wants scenes drafted by two models and the better draft
 * kept. Undefined means one writer, as before.
 */
export function getStoredSecondWriterConfig(): LLMProviderConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(SECOND_WRITER_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.enabled === false) return undefined;
    return {
      provider: parsed.provider === 'qwen' ? 'qwen' : parsed.provider === 'ollama' ? 'ollama' : 'gemini',
      ollamaEndpoint: parsed.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT,
      ollamaModel: parsed.ollamaModel || DEFAULT_OLLAMA_MODEL,
      ...(typeof parsed.qwenModel === 'string' && parsed.qwenModel.trim() ? { qwenModel: parsed.qwenModel.trim() } : {}),
      ...(typeof parsed.geminiModel === 'string' && parsed.geminiModel.trim() ? { geminiModel: parsed.geminiModel.trim() } : {}),
    };
  } catch {
    return undefined;
  }
}

export function saveStoredSecondWriterConfig(config: (LLMProviderConfig & { enabled: boolean }) | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (!config) localStorage.removeItem(SECOND_WRITER_STORAGE_KEY);
    else localStorage.setItem(SECOND_WRITER_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save second writer config to localStorage:', err);
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
  overrideConfig?: LLMProviderConfig,
  maxTokens?: number,
  jsonOnly = false,
  deliberate = false,
  onUsage?: (usage:TokenUsage) => void,
): Promise<string> {
  const config = overrideConfig || getStoredProviderConfig();
  const providerTag = config.provider === 'qwen' ? `Qwen:${config.qwenModel||'qwen3.8-flash'}` : config.provider === 'ollama' ? `Ollama:${config.ollamaModel}` : 'Gemini';
  const startTime = Date.now();

  logToTerminal(
    `Dispatching request to ${providerTag} (temp: ${temperature}, JSON: ${Boolean(schema || jsonOnly)}${maxTokens ? `, limit: ${maxTokens} tok` : ''})`,
    'LLM',
    'llm'
  );

  let reported=false;
  const recordUsage=(metadata:unknown)=>{
    const usage=providerTokenUsage(config.provider,metadata);
    if(usage.input===undefined&&usage.output===undefined)return;
    reported=true;
    onUsage?.({input:usage.input??Math.ceil((prompt.length+(systemInstruction?.length||0)+(schema?JSON.stringify(schema).length:0))/4),
      output:usage.output??0,estimatedInput:usage.input===undefined,estimatedOutput:usage.output===undefined});
  };
  let result: string;
  if (config.provider === 'qwen') {
    result = await generateQwenBrowserText(prompt, systemInstruction, maxTokens, config.qwenModel, temperature, schema || (jsonOnly ? {type:'object'} : undefined),recordUsage);
  } else if (config.provider === 'ollama') {
    result = await generateOllamaText(
      prompt,
      systemInstruction,
      schema || (jsonOnly ? { type: 'object' } : undefined),
      temperature,
      config.ollamaModel,
      config.ollamaEndpoint,
      maxTokens,
      topP,
      topK,
      undefined, recordUsage
    );
  } else {
    result = await generateGeminiText(prompt, systemInstruction, schema, temperature, topP, topK, maxTokens, jsonOnly, config.geminiModel, deliberate, recordUsage);
  }

  if(!reported)onUsage?.({input:Math.ceil((prompt.length+(systemInstruction?.length||0)+(schema?JSON.stringify(schema).length:0))/4),output:Math.ceil(result.length/4),estimatedInput:true,estimatedOutput:true});

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const words = result.split(/\s+/).filter(Boolean).length;
  logToTerminal(
    `${providerTag} completed in ${durationSec}s (~${words} words)`,
    'LLM',
    'success'
  );

  return result;
}

/**
 * Unified stream text generation dispatch
 */
export async function generateTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  temperature: number = 0.7,
  overrideConfig?: LLMProviderConfig,
  schema?: object,
  maxTokens?: number,
): Promise<string> {
  const config = overrideConfig || getStoredProviderConfig();
  const providerTag = config.provider === 'qwen' ? `Qwen:${config.qwenModel||'qwen3.8-flash'}` : config.provider === 'ollama' ? `Ollama:${config.ollamaModel}` : 'Gemini';
  const startTime = Date.now();

  logToTerminal(
    `Starting stream generation via ${providerTag} (temp: ${temperature})`,
    'LLM',
    'llm'
  );

  let chunkCount = 0;
  const wrappedOnChunk = (chunk: string) => {
    chunkCount++;
    onChunk(chunk);
  };

  let result: string;
  if (config.provider === 'qwen') {
    result = await generateQwenBrowserText(prompt, systemInstruction, maxTokens, config.qwenModel, temperature, schema);
    wrappedOnChunk(result);
  } else if (config.provider === 'ollama') {
    result = await generateOllamaTextStream(
      prompt,
      wrappedOnChunk,
      systemInstruction,
      config.ollamaModel,
      config.ollamaEndpoint,
      schema,
      temperature,
      maxTokens,
    );
  } else {
    result = await generateGeminiTextStream(prompt, wrappedOnChunk, systemInstruction, temperature, undefined, undefined, config.geminiModel, schema, maxTokens);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const words = result.split(/\s+/).filter(Boolean).length;
  logToTerminal(
    `${providerTag} stream complete in ${durationSec}s (~${words} words, ${chunkCount} chunks)`,
    'LLM',
    'success'
  );

  return result;
}

