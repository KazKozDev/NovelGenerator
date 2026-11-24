/**
 * Hugging Face Inference Providers: one OpenAI-compatible router in front of many providers.
 * A model is "org/name", optionally with ":provider" (or ":fastest", ":cheapest") to say who
 * serves it. Node only: the token never enters the browser bundle.
 */
import { readEnvSetting } from './envService';

const ROUTER = 'https://router.huggingface.co/v1';
const base = () => (readEnvSetting('HF_BASE_URL') || ROUTER).replace(/\/+$/, '');

const RUNAWAY = 'the model was repeating itself or writing only blank space';
/** What a caller may watch while the answer is being written. */
export interface LiveAnswer { retryOutputLimit?: boolean; onDelta?: (text: string) => void; onRestart?: (why: string) => void }

export async function generateHuggingFaceText(prompt: string, system?: string, maxTokens = 16384, model = '',
  temperature = 0.2, onMetadata?: (metadata: unknown) => void, schema?: object, live: LiveAnswer = {}): Promise<string> {
  const token = readEnvSetting('HF_TOKEN');
  if (!token) throw new Error('Set HF_TOKEN in .env.local or the environment.');
  if (!model.trim()) throw new Error('Set a Hugging Face model: org/name, optionally org/name:provider.');
  const messages = [...(system || schema ? [{ role: 'system', content: (system || '') + (schema ? `\nReturn one JSON object. Every required field in this complete JSON Schema must be present; no omitted fields:\n${JSON.stringify(schema)}` : '') }] : []), { role: 'user', content: prompt }];
  // Hidden reasoning is paid for out of the answer's own length and read by nothing here; the
  // pipeline runs every model with it off. A provider that does not know the setting is asked without it.
  let room = maxTokens, jsonMode = !!schema, withUsage = true, noThinking = true;
  // The answer is streamed. The router's gateway gives a whole, unstreamed answer 120 seconds
  // and then returns 504; a scene takes longer to write than that.
  const send = async () => {
    const controller = new AbortController();
    const response = await fetch(`${base()}/chat/completions`, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      body: JSON.stringify({ model, messages, max_tokens: room, temperature, stream: true, ...(withUsage ? { stream_options: { include_usage: true } } : {}), ...(noThinking ? { reasoning_effort: 'none' } : {}), ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }) });
    return { response, controller };
  };
  // A gateway time-out, an overloaded provider or a dropped connection is not the book's
  // failure: it is asked again, a few times, with a pause.
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, process.env.VITEST ? 0 : ms));
  const TRANSIENT = [408, 425, 429, 500, 502, 503, 504];
  const ask = async (): Promise<{ response?: Response; content: string; finish: string | null; usage: unknown; provider: unknown; error?: unknown }> => {
    let last: { response?: Response; content: string; finish: string | null; usage: unknown; provider: unknown; error?: unknown } = { content: '', finish: null, usage: null, provider: null };
    for (const wait of [0, 3000, 10000, 30000]) {
      if (wait) await pause(wait);
      try {
        if (wait) live.onRestart?.(last.error ? String(last.error instanceof Error ? last.error.message : last.error) : `the provider answered ${last.response?.status}`);
        const { response, controller } = await send();
        if (!response.ok) { last = { ...last, response, error: undefined }; if (TRANSIENT.includes(response.status)) continue; return last; }
        const read = await readAnswer(response, controller, live.onDelta);
        // A stream that broke off before the model finished is the same kind of failure.
        if (!read.finish && !read.content.trim()) { last = { ...read, response, error: new Error('Hugging Face stream ended before any answer') }; continue; }
        return { ...read, response };
      } catch (error) {
        last = { ...last, response: undefined, error };
        // A loop in JSON mode is answered by asking without JSON mode, once; the shape of the
        // answer is in the instructions either way.
        if (error instanceof Error && error.message === RUNAWAY) { if (!jsonMode) return last; jsonMode = false; }
      }
    }
    return last;
  };
  let answer = await ask();
  // An answer that ran to its limit in JSON mode is the slow form of the same loop: asked
  // again once without JSON mode and with the same room, not with twice the room.
  if (answer.response?.ok && answer.finish === 'length' && jsonMode && live.retryOutputLimit !== false) { jsonMode = false; live.onRestart?.('the answer ran to its length limit in JSON mode; asking once more without it'); answer = await ask(); }
  const refused = async () => answer.response && !answer.response.ok && (answer.response.status === 400 || answer.response.status === 422) ? await answer.response.clone().text().catch(() => '') : '';
  // Providers behind the router differ in what they accept. Each refusal that names its
  // cause is answered once: without usage reporting, without the JSON response format (the
  // schema is in the system message either way), or with half the length asked for.
  for (let turn = 0; turn < 6; turn++) {
    const detail = await refused();
    if (!answer.response || answer.response.ok || !(answer.response.status === 400 || answer.response.status === 422)) break;
    if (withUsage && /stream_options|include_usage/i.test(detail)) withUsage = false;
    else if (noThinking && /reasoning/i.test(detail)) noThinking = false;
    else if (jsonMode && /response_format|json_object|json mode/i.test(detail)) jsonMode = false;
    else if (room > 4096 && /max_tokens|max_completion_tokens|maximum|context length|too large|exceeds/i.test(detail)) room = Math.floor(room / 2);
    // A refusal that does not name its cause: the optional settings are given up one at a time.
    else if (noThinking) noThinking = false;
    else if (jsonMode) jsonMode = false;
    else if (withUsage) withUsage = false;
    else break;
    answer = await ask();
  }
  if (!answer.response) throw new Error(`Hugging Face request failed after several attempts: ${answer.error instanceof Error ? answer.error.message : String(answer.error)}`);
  if (!answer.response.ok) {
    const status = answer.response.status;
    const detail = (await answer.response.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(`Hugging Face request failed [${status}]${status === 401 ? ': API key not valid — the token was refused' : status === 402 ? ': quota exceeded for this account' : status === 404 ? `: model ${model} not found, try pulling it from the router's list` : TRANSIENT.includes(status) ? ' after several attempts' : ''}. ${detail.slice(0, 300)}`);
  }
  onMetadata?.({ finish_reason: answer.finish, usage: answer.usage, provider: answer.provider });
  if (answer.finish === 'length') throw new Error('Hugging Face output reached its token limit; partial response rejected.');
  if (!answer.content.trim()) throw new Error(`Hugging Face returned no final content (finish: ${answer.finish ?? 'missing completion'}).`);
  return answer.content;
}

/**
 * Reads an answer that came as a stream of events, or whole, as the provider chose to send it.
 * A stream is alive while bytes arrive, however long the answer takes; it is dead when none
 * has arrived for a while. That silence, not the total time, is what ends a request: a slow
 * model is waited for, a dropped connection is not.
 */
async function readAnswer(response: Response, controller: AbortController, onDelta?: (text: string) => void): Promise<{ content: string; finish: string | null; usage: unknown; provider: unknown }> {
  if (!/text\/event-stream/i.test(response.headers.get('content-type') || '') || !response.body) {
    const data = await response.json();
    const choice = data.choices?.[0];
    const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    if (content) onDelta?.(content);
    return { content, finish: choice?.finish_reason ?? null, usage: data.usage ?? null, provider: data.provider ?? null };
  }
  let content = '', finish: string | null = null, usage: unknown = null, provider: unknown = null, pending = '', blank = 0;
  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const event = JSON.parse(payload);
      const choice = event.choices?.[0];
      if (typeof choice?.delta?.content === 'string' && choice.delta.content) {
        content += choice.delta.content; onDelta?.(choice.delta.content);
        // A model stuck in JSON mode writes spaces and newlines until its limit. That is seen
        // within seconds here and ended, not waited out for minutes and then paid for twice.
        blank = choice.delta.content.trim() ? 0 : blank + choice.delta.content.length;
        if (blank > 1500) { controller.abort(); throw new Error(RUNAWAY); }
        // The same few words over and over is the other shape of the same loop.
        if (content.length > 6000 && content.length % 500 < choice.delta.content.length) { const tail = content.slice(-200); if (content.slice(-3000, -200).split(tail).length > 4) { controller.abort(); throw new Error(RUNAWAY); } }
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (event.usage) usage = event.usage;
      if (event.provider) provider = event.provider;
    } catch (error) { if (error instanceof Error && error.message === RUNAWAY) throw error; /* Otherwise a keep-alive or a partial line; the next read completes it. */ }
  };
  const quiet = Number(readEnvSetting('HF_IDLE_MS')) || 90000;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const silence = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(`no data from the provider for ${Math.round(quiet / 1000)} seconds`)); }, quiet); });
    let step: ReadableStreamReadResult<Uint8Array>;
    try { step = await Promise.race([reader.read(), silence]); } finally { clearTimeout(timer); }
    if (step.done) break;
    pending += decoder.decode(step.value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    lines.forEach(line => take(line.trim()));
  }
  take(pending.trim());
  return { content, finish, usage, provider };
}

/** The router's public list: which models it serves, and through whom. No token needed. */
export async function listHuggingFaceModels(): Promise<{ id: string; providers: string[] }[]> {
  const response = await fetch(`${base()}/models`);
  if (!response.ok) throw new Error(`Hugging Face model list failed [${response.status}].`);
  const data = await response.json();
  return (Array.isArray(data?.data) ? data.data : []).filter((m: any) => typeof m?.id === 'string')
    .map((m: any) => ({ id: m.id, providers: (Array.isArray(m.providers) ? m.providers : []).map((p: any) => p?.provider).filter((p: unknown) => typeof p === 'string') }));
}
