import { LLMProviderConfig } from '../types';
import { GEMINI_MODEL_NAME } from '../constants';
import { DEFAULT_OLLAMA_MODEL } from '../services/ollamaService';

/**
 * Returns the full human-readable and technical name of an AI model.
 * E.g. "Google Gemini 3.6 Flash (gemini-3.6-flash)", "Anthropic Claude 3.5 Sonnet", etc.
 */
export function getFullModelName(config?: LLMProviderConfig): string {
  if (!config) return '';

  switch (config.provider) {
    case 'gemini': {
      const raw = config.geminiModel?.trim() || GEMINI_MODEL_NAME;
      if (/^gemini-3\.6-flash/i.test(raw)) return `Google Gemini 3.6 Flash (${raw})`;
      if (/^gemini-3\.8/i.test(raw)) return `Google Gemini 3.8 (${raw})`;
      if (/^gemini-2\.5-flash/i.test(raw)) return `Google Gemini 2.5 Flash (${raw})`;
      if (/^gemini-2\.5-pro/i.test(raw)) return `Google Gemini 2.5 Pro (${raw})`;
      if (/^gemini-1\.5-pro/i.test(raw)) return `Google Gemini 1.5 Pro (${raw})`;
      if (/^gemini-1\.5-flash/i.test(raw)) return `Google Gemini 1.5 Flash (${raw})`;
      return `Google Gemini (${raw})`;
    }

    case 'anthropic': {
      const raw = config.anthropicModel?.trim() || 'claude-opus-5-5';
      if (/claude-opus-5-5|claude-5-5-opus/i.test(raw)) return `Anthropic Claude Opus 5.5 (${raw})`;
      if (/claude-3-7-sonnet|claude-3\.7-sonnet/i.test(raw)) return `Anthropic Claude 3.7 Sonnet (${raw})`;
      if (/claude-3-5-sonnet|claude-3\.5-sonnet/i.test(raw)) return `Anthropic Claude 3.5 Sonnet (${raw})`;
      if (/claude-3-5-haiku|claude-3\.5-haiku/i.test(raw)) return `Anthropic Claude 3.5 Haiku (${raw})`;
      if (/claude-3-opus|claude-3\.0-opus/i.test(raw)) return `Anthropic Claude 3 Opus (${raw})`;
      return `Anthropic Claude (${raw})`;
    }


    case 'ollama': {
      const raw = config.ollamaModel?.trim() || DEFAULT_OLLAMA_MODEL;
      if (/^llama-?3\.3/i.test(raw)) return `Meta Llama 3.3 (${raw} via Ollama)`;
      if (/^llama-?3\.1/i.test(raw)) return `Meta Llama 3.1 (${raw} via Ollama)`;
      if (/^llama-?3/i.test(raw)) return `Meta Llama 3 (${raw} via Ollama)`;
      if (/^qwen-?2\.5/i.test(raw)) return `Alibaba Qwen 2.5 (${raw} via Ollama)`;
      if (/^deepseek/i.test(raw)) return `DeepSeek (${raw} via Ollama)`;
      if (/^mistral/i.test(raw)) return `Mistral (${raw} via Ollama)`;
      if (/^gemma-?2/i.test(raw)) return `Google Gemma 2 (${raw} via Ollama)`;
      return `Ollama Local Model (${raw})`;
    }

    case 'huggingface': {
      const raw = config.hfModel?.trim() || 'Hugging Face Inference Router';
      if (/qwen/i.test(raw)) return `Alibaba Qwen (${raw} via Hugging Face)`;
      if (/llama/i.test(raw)) return `Meta Llama (${raw} via Hugging Face)`;
      if (/mistral/i.test(raw)) return `Mistral (${raw} via Hugging Face)`;
      return `Hugging Face (${raw})`;
    }

    case 'compatible': {
      const raw = config.compatibleModel?.trim() || 'OpenAI Compatible Model';
      if (/^gpt-4o-mini/i.test(raw)) return `OpenAI GPT-4o mini (${raw})`;
      if (/^gpt-4o/i.test(raw)) return `OpenAI GPT-4o (${raw})`;
      if (/^gpt-4-turbo/i.test(raw)) return `OpenAI GPT-4 Turbo (${raw})`;
      if (/^o1/i.test(raw)) return `OpenAI o1 (${raw})`;
      if (/^o3-mini/i.test(raw)) return `OpenAI o3-mini (${raw})`;
      return `OpenAI-Compatible (${raw})`;
    }

    default:
      return String(config.provider);
  }
}

/**
 * Builds the default generation models string combining Author model and optional Editor/Reader model.
 */
export function buildGenerationModelsString(
  authorConfig?: LLMProviderConfig,
  readerConfig?: (LLMProviderConfig & { enabled?: boolean }) | undefined
): string {
  const authorName = getFullModelName(authorConfig);
  const readerName = readerConfig && readerConfig.enabled !== false ? getFullModelName(readerConfig) : '';

  if (readerName && readerName !== authorName) {
    return `Author: ${authorName}; Editor: ${readerName}`;
  }
  return `Author: ${authorName}`;
}
