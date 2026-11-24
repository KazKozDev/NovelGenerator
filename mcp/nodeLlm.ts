import { APP_ANTHROPIC_MODEL, generateAnthropicText } from '../services/anthropicService';
import { generateCompatibleText } from '../services/compatibleService';
import { generateOllamaText } from '../services/ollamaService';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ProjectStore } from '../utils/novel/v2/store';

export type NodeProvider = 'anthropic' | 'ollama' | 'compatible';
export interface NodeModel { provider: NodeProvider; model: string }

const PROVIDERS: NodeProvider[] = ['anthropic', 'ollama', 'compatible'];

/**
 * Who writes when an agent runs a stage. The browser keeps its model choice in the page, out of reach here,
 * so the server takes it from its own environment: NOVEL_PROVIDER and NOVEL_MODEL for the writer,
 * NOVEL_VALIDATOR_PROVIDER and NOVEL_VALIDATOR_MODEL for the editor when it should be a different model.
 */
export function modelsFromEnv(env: NodeJS.ProcessEnv = process.env): { writer: NodeModel; validator?: NodeModel } {
  const pick = (provider: string | undefined, model: string | undefined, fallback?: NodeModel): NodeModel | undefined => {
    if (!provider && !model) return fallback;
    const p = (provider || fallback?.provider || 'anthropic') as NodeProvider;
    if (!PROVIDERS.includes(p)) throw new Error(`Unknown provider ${p}: use ${PROVIDERS.join(', ')}.`);
    const m = model || (p === 'anthropic' ? APP_ANTHROPIC_MODEL : '');
    if (!m) throw new Error(`Name the ${p} model in the server's environment.`);
    return { provider: p, model: m };
  };
  const writer = pick(env.NOVEL_PROVIDER, env.NOVEL_MODEL, { provider: 'anthropic', model: APP_ANTHROPIC_MODEL })!;
  return { writer, validator: pick(env.NOVEL_VALIDATOR_PROVIDER, env.NOVEL_VALIDATOR_MODEL) };
}

export const modelLabel = (m: NodeModel): string => `${m.provider}:${m.model}`;

async function ask(m: NodeModel, prompt: string, system: string, options: Parameters<NovelLLM>[2] = {}): Promise<string> {
  const maxTokens = options.maxTokens || 16384;
  if (m.provider === 'anthropic') return generateAnthropicText(prompt, system, maxTokens, m.model, options.deliberate);
  if (m.provider === 'compatible') return generateCompatibleText(prompt, system, maxTokens, m.model, options.temperature ?? 0.2, options.schema);
  const endpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
  return generateOllamaText(prompt, system, options.schema, options.temperature ?? 0.7, m.model, endpoint, Math.max(32768, maxTokens));
}

/**
 * The pipeline's model call, with each call written to the run log the way the app writes it,
 * so the app's inspector shows what an agent's run asked and how it ended.
 */
export function nodeLlm(store: ProjectStore, models: { writer: NodeModel; validator?: NodeModel }, active: () => void): NovelLLM {
  let calls = 0;
  return async (prompt, system, options = {}) => {
    active();
    // Search by meaning needs the app's small network; without it the engine searches by words.
    if (options.route === 'helper') throw new Error('Meaning search is not available to the agent server.');
    const m = options.route === 'validator' && models.validator ? models.validator : models.writer;
    const start = Date.now(), id = `${start}:${options.stage || 'model'}:mcp${++calls}`;
    store.log('model_call', JSON.stringify({ id, entry: { timestamp: start, chapterNumber: 0, type: 'execution', message: `${options.stage || 'model'} · ${modelLabel(m)} · agent`, details: `stage: ${options.stage || 'unlabelled'} · role: ${options.route || 'writer'} · sent ${prompt.length + system.length} characters`, finished: false } }));
    const finish = (type: 'execution' | 'warning', outcome: string) => store.log('model_result', JSON.stringify({ id, result: { type, finished: true, finishedAt: Date.now(), outcome } }));
    try {
      const text = await ask(m, prompt, system, options);
      finish('execution', `Received ${text.length} characters in ${Math.round((Date.now() - start) / 1000)} s`);
      active();
      return text;
    } catch (error) {
      finish('warning', error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}
