/**
 * Claude through the Anthropic API, for the command-line scripts.
 *
 * Not wired into the browser app: the key is read from the environment or
 * .env.local and never built into a bundle.
 *
 * What this model does not take, and so is not sent: a temperature (anything
 * but the default is refused), a thinking budget, a prefilled answer. Thinking
 * is switched off, as it is for every other model the pipeline calls. The
 * prompts already ask for JSON and the pipeline parses what comes back, so no
 * output schema is imposed here — the pipeline's schemas leave their lists
 * untyped, which a strict schema would not accept.
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

let client: Anthropic | null = null;

function keyFromEnvFile(): string | undefined {
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split('\n').find(item => /^\s*ANTHROPIC_API_KEY\s*=/.test(item));
  return line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') || undefined;
}

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY || keyFromEnvFile();
    if (!apiKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error('No Anthropic credential: set ANTHROPIC_API_KEY in the environment or in .env.local.');
    }
    client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }
  return client;
}

export async function generateAnthropicText(
  prompt: string,
  system?: string,
  maxTokens = 16384,
  model = DEFAULT_ANTHROPIC_MODEL,
  deliberate = false,
): Promise<string> {
  // Streamed, so a long answer does not run into the request timeout.
  const message = await anthropic().messages.stream({
    model,
    max_tokens: maxTokens + (deliberate ? 8192 : 0),
    // Off, except for the calls the pipeline marks as worth thinking over, or
    // when a run asks for it everywhere: ANTHROPIC_EFFORT=low|medium|high.
    ...(process.env.ANTHROPIC_EFFORT || deliberate
      ? { thinking: { type: 'adaptive' as const }, output_config: { effort: (process.env.ANTHROPIC_EFFORT || 'medium') as 'low' | 'medium' | 'high' } }
      : { thinking: { type: 'disabled' as const } }),
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  }).finalMessage();
  if (message.stop_reason === 'refusal') throw new Error(`${model} declined the request.`);
  const text = message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');
  if (message.stop_reason === 'max_tokens') throw new Error(`${model} ran out of its ${maxTokens}-token answer before finishing.`);
  if (!text.trim()) throw new Error(`${model} returned an empty answer.`);
  return text;
}

/** What the app writes with when no model is named on the form. */
export const APP_ANTHROPIC_MODEL = 'claude-opus-5-5';

/**
 * The same call for the app's local gateway: the text is passed on as it arrives, and what it
 * cost is reported in the names the app already reads for Qwen and Hugging Face. A schema, when
 * there is one, goes into the instructions; none is imposed, for the reason given above.
 */
export async function generateAnthropicLive(prompt: string, system?: string, maxTokens = 16384, model = APP_ANTHROPIC_MODEL,
  onMetadata?: (metadata: unknown) => void, schema?: object, live: { onDelta?: (text: string) => void; onRestart?: (why: string) => void } = {}): Promise<string> {
  const instructions = (system || '') + (schema ? `\nReturn one JSON object and nothing else. Every required field in this complete JSON Schema must be present; no omitted fields:\n${JSON.stringify(schema)}` : '');
  const ask = async () => {
    const stream = anthropic().messages.stream({ model, max_tokens: maxTokens, thinking: { type: 'disabled' as const },
      ...(instructions.trim() ? { system: instructions } : {}), messages: [{ role: 'user', content: prompt }] });
    stream.on('text', delta => live.onDelta?.(delta));
    return stream.finalMessage();
  };
  // An overloaded service or a dropped connection is not the book's failure: it is asked again, a few times.
  let message: Awaited<ReturnType<typeof ask>> | undefined, failure: unknown;
  for (const wait of [0, 3000, 10000, 30000]) {
    if (wait) { live.onRestart?.(failure instanceof Error ? failure.message : String(failure)); await new Promise(resolve => setTimeout(resolve, process.env.VITEST ? 0 : wait)); }
    try { message = await ask(); break; }
    catch (error) { failure = error; const status = (error as { status?: number })?.status; if (status !== undefined && ![408, 409, 425, 429, 500, 502, 503, 504, 529].includes(status)) break; }
  }
  if (!message) {
    const status = (failure as { status?: number })?.status;
    throw new Error(`Anthropic request failed${status ? ` [${status}]` : ''}: ${status === 401 ? 'API key not valid — the key was refused' : status === 404 ? `model ${model} not found` : failure instanceof Error ? failure.message : String(failure)}`);
  }
  onMetadata?.({ finish_reason: message.stop_reason, usage: { prompt_tokens: message.usage?.input_tokens, completion_tokens: message.usage?.output_tokens } });
  if (message.stop_reason === 'refusal') throw new Error(`${model} declined the request.`);
  const text = message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');
  if (message.stop_reason === 'max_tokens') throw new Error('Anthropic output reached its token limit; partial response rejected.');
  if (!text.trim()) throw new Error(`${model} returned an empty answer.`);
  return text;
}

/** The models this key may use, newest first, by their ids. */
export async function listAnthropicModels(): Promise<string[]> {
  const ids: string[] = [];
  for await (const model of anthropic().models.list({ limit: 1000 })) ids.push(model.id);
  return ids;
}
