/** What a caller may watch while the answer is being written. */
export interface LiveText { onChunk?: (text: string) => void; onRestart?: (why: string) => void }

/** The local server owns the token and the upstream endpoint, and passes the answer on as it arrives. */
export async function generateHuggingFaceBrowserText(prompt: string, system?: string, maxTokens = 16384,
  model = '', temperature = 0.2, schema?: object, onUsage?: (metadata: unknown) => void, live: LiveText = {}): Promise<string> {
  return gatewayText('/api/hf', 'Hugging Face', { prompt, system, maxTokens, model, temperature, schema }, onUsage, live);
}
/** Anthropic through the same kind of local gateway. An empty model means the server's default. */
export async function generateAnthropicBrowserText(prompt: string, system?: string, maxTokens = 16384,
  model?: string, temperature = 0.2, schema?: object, onUsage?: (metadata: unknown) => void, live: LiveText = {}): Promise<string> {
  return gatewayText('/api/anthropic', 'Anthropic', { prompt, system, maxTokens, ...(model ? { model } : {}), temperature, schema }, onUsage, live);
}
async function gatewayText(path: string, name: string, body: object, onUsage?: (metadata: unknown) => void, live: LiveText = {}): Promise<string> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!/ndjson/i.test(response.headers.get('content-type') || '') || !response.body) {
    const data = await response.json();
    if (data.metadata) onUsage?.(data.metadata);
    if (!response.ok) throw new Error(data.error || `${name} request failed`);
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error(`${name} returned no content`);
    return data.text;
  }
  let pending = '', final: any;
  const take = (row: string) => {
    if (!row.trim()) return;
    let event: any;
    try { event = JSON.parse(row); } catch { return; }
    if (typeof event.delta === 'string') live.onChunk?.(event.delta);
    else if (typeof event.restart === 'string') live.onRestart?.(event.restart);
    else final = event;
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const rows = pending.split('\n');
    pending = rows.pop() || '';
    rows.forEach(take);
  }
  take(pending);
  if (final?.metadata) onUsage?.(final.metadata);
  if (!final) throw new Error(`${name} request failed: the local server closed the answer before its end`);
  if (final.error) throw new Error(final.error);
  if (typeof final.text !== 'string' || !final.text.trim()) throw new Error(`${name} returned no content`);
  return final.text;
}
export async function fetchHuggingFaceModels(): Promise<{ id: string; providers: string[] }[]> {
  const response = await fetch('/api/hf/models');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Model list failed');
  return Array.isArray(data.models) ? data.models : [];
}

/** A small classifier through the local gateway: for each sentence, the score of the first label. */
export async function labelHuggingFaceBrowser(model: string, inputs: string[], labels: string[], template: string): Promise<number[]> {
  const response = await fetch('/api/hf/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, inputs, labels, template }) });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.scores)) throw new Error(data.error || 'Labelling failed');
  return data.scores;
}
export async function fetchHuggingFaceLabelModels(): Promise<{ id: string; providers: string[] }[]> {
  const response = await fetch('/api/hf/label-models');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Model list failed');
  return Array.isArray(data.models) ? data.models : [];
}

/** The local network that picks objects out of text, through the local gateway. */
export async function findObjectsBrowser(model: string, texts: string[], labels: string[], threshold: number): Promise<{ text: string; score: number }[][]> {
  const response = await fetch('/api/local/objects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, texts, labels, threshold }) });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.found)) throw new Error(data.error || 'The local network failed');
  return data.found;
}
