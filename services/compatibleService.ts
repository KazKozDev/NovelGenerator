import { readEnvSetting } from './envService';

function connection() {
  const raw = readEnvSetting('COMPATIBLE_BASE_URL');
  if (!raw) throw new Error('Set COMPATIBLE_BASE_URL in API settings (including /v1 when required).');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API base URL must be an HTTP(S) address without credentials, query or fragment.');
  const key = readEnvSetting('COMPATIBLE_API_KEY');
  return { base: url.href.replace(/\/+$/, ''), headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) } };
}
export async function listCompatibleModels(): Promise<string[]> {
  const { base, headers } = connection();
  const response = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`API model list failed [${response.status}].`);
  const data = await response.json();
  return (Array.isArray(data.data) ? data.data : []).flatMap((m: any) => typeof m?.id === 'string' ? [m.id] : []);
}
export async function generateCompatibleText(prompt: string, system = '', maxTokens = 16384, model = '', temperature = 0.2,
  schema?: object, onDelta?: (text: string) => void, onMetadata?: (metadata: unknown) => void): Promise<string> {
  if (!model.trim()) throw new Error('Enter an API model ID.');
  const { base, headers } = connection();
  const messages = [{ role: 'system', content: system + (schema ? `\nReturn JSON matching this schema: ${JSON.stringify(schema)}` : '') }, { role: 'user', content: prompt }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900000);
  try {
    const response = await fetch(`${base}/chat/completions`, { method: 'POST', headers, signal: controller.signal,
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true, ...(schema ? { response_format: { type: 'json_object' } } : {}) }) });
    if (!response.ok) throw new Error(`Compatible API request failed [${response.status}].`);
    let text = '', finish: string | undefined, usage: unknown;
    if (!/text\/event-stream/i.test(response.headers.get('content-type') || '')) {
      const data = await response.json();
      text = data.choices?.[0]?.message?.content || ''; finish = data.choices?.[0]?.finish_reason; usage = data.usage;
      if (text) onDelta?.(text);
    } else {
      if (!response.body) throw new Error('API returned no response body.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', ended = false;
      const take = (line: string) => {
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { ended = true; return; }
        if (!payload) return;
        const data = JSON.parse(payload);
        if (data.error) throw new Error('Compatible API reported a stream error.');
        if (data.usage) usage = data.usage;
        const choice = data.choices?.[0];
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (typeof choice?.delta?.content === 'string') { text += choice.delta.content; onDelta?.(choice.delta.content); }
      };
      for (;;) {
        const part = await reader.read();
        pending += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
        const lines = pending.split(/\r?\n/); pending = lines.pop() || ''; lines.forEach(take);
        if (part.done) break;
      }
      take(pending);
      if (!ended && !finish) throw new Error('Compatible API stream ended before completion; partial response rejected.');
    }
    onMetadata?.({ usage, finish_reason: finish });
    if (finish === 'length') throw new Error('Compatible API output reached its token limit; partial response rejected.');
    if (typeof text !== 'string' || !text.trim()) throw new Error('Compatible API returned no text content.');
    return text;
  } catch (error) {
    if (error instanceof Error && (error.message === 'fetch failed' || error.name === 'AbortError')) {
      const code = (error as Error & { cause?: { code?: string } }).cause?.code;
      throw new Error(`Cannot connect to Compatible API at ${base}. ${error.name === 'AbortError' ? 'The request timed out.' : code === 'ECONNREFUSED' ? 'Connection refused: the API server is not listening at this address.' : 'Check that the API server is running and the base URL is correct.'}`);
    }
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}
