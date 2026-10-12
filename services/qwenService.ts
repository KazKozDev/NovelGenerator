/** CLI-only Qwen transport. Credentials never enter the browser bundle. */
import { existsSync, readFileSync } from 'node:fs';

export function qwenSetting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split('\n').find(item => item.trimStart().startsWith(`${name}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

export async function generateQwenText(prompt: string, system?: string, maxTokens = 16384, model = 'qwen3.8-flash',
  temperature = 0.2, onMetadata?: (metadata: unknown) => void, schema?: object): Promise<string> {
  const apiKey = qwenSetting('QWEN_API_KEY');
  const base = qwenSetting('QWEN_BASE_URL');
  if (!apiKey || !base) throw new Error('Set QWEN_API_KEY and QWEN_BASE_URL in .env.local or the environment.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900000);
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [...(system || schema ? [{ role: 'system', content: (system || '') + (schema ? `\nReturn one JSON object. Every required field in this complete JSON Schema must be present; no omitted fields:\n${JSON.stringify(schema)}` : '') }] : []), { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature, enable_thinking: false, stream: false,
        ...(schema ? { response_format: { type: 'json_object' } } : {}) }),
    });
    if (!response.ok) throw new Error(`Qwen API request failed [${response.status}]. ${(await response.text().catch(() => '')).slice(0, 300)}`.trim());
    const data = await response.json();
    const choice = data.choices?.[0];
    onMetadata?.({ finish_reason: choice?.finish_reason ?? null, usage: data.usage ?? null });
    if (choice?.finish_reason === 'length') throw new Error('Qwen output reached its token limit; partial response rejected.');
    if (choice?.finish_reason !== 'stop') throw new Error(`Qwen response did not finish normally: ${choice?.finish_reason ?? 'missing completion'}.`);
    if (typeof choice.message?.content !== 'string' || !choice.message.content.trim()) throw new Error('Qwen returned no final content.');
    return choice.message.content;
  } finally { clearTimeout(timeout); }
}

/** The models the configured Qwen endpoint offers, by their ids. */
export async function listQwenModels(): Promise<string[]> {
  const apiKey = qwenSetting('QWEN_API_KEY'), base = qwenSetting('QWEN_BASE_URL');
  if (!apiKey || !base) throw new Error('Set QWEN_API_KEY and QWEN_BASE_URL in .env.local or the environment.');
  const response = await fetch(`${base.replace(/\/+$/, '')}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Qwen model list failed (${response.status})`);
  return (Array.isArray(data.data) ? data.data : []).map((model: any) => String(model.id || ''))
    // A book is written with a text model: what listens, speaks, draws or embeds is left out of the list.
    .filter((id: string) => id.startsWith('qwen') && !/audio|asr|tts|realtime|image|video|ocr|embed|rerank|omni|-mt-|livetranslate/i.test(id)).sort();
}
