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
