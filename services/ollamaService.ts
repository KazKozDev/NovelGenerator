/**
 * Ollama Service - Local LLM integration
 */

export const DEFAULT_OLLAMA_ENDPOINT = '/api/ollama';
export const DEFAULT_OLLAMA_MODEL = 'llama3.1';

export interface OllamaGeneratePayload {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  format?: 'json' | object;
  think?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

export function parseOllamaTagsResponse(data: any): string[] {
  if (!data || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.map((m: any) => m.name || m.model).filter(Boolean);
}

export function stripThinking(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(cleaned)) throw new Error('Ollama response ended inside a thinking block.');
  if (cleaned.includes('</think>')) {
    cleaned = cleaned.slice(cleaned.lastIndexOf('</think>') + 8);
  }
  return cleaned.trim();
}

export function buildOllamaGeneratePayload(params: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  isJson?: boolean;
  schema?: object;
  stream?: boolean;
  think?: boolean;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}): OllamaGeneratePayload {
  const payload: OllamaGeneratePayload = {
    model: params.model || DEFAULT_OLLAMA_MODEL,
    prompt: params.prompt,
    stream: params.stream ?? false,
    think: params.think ?? false, // Off unless the caller's provider role enables it.
    options: {
      temperature: params.temperature ?? 0.7,
      ...(params.maxTokens !== undefined ? { num_predict: params.maxTokens } : {}),
      ...(params.topP !== undefined ? { top_p: params.topP } : {}),
      ...(params.topK !== undefined ? { top_k: params.topK } : {})
    }
  };

  const antiThinkingPrompt = "Do not output thinking, inner monologue, reasoning steps, or <think> tags. Output only direct final response.";
  if (params.think) {
    if (params.system) payload.system = params.system;
  } else if (params.system) {
    payload.system = `${params.system}\n\n${antiThinkingPrompt}`;
  } else {
    payload.system = antiThinkingPrompt;
  }

  if (params.schema || params.isJson) {
    payload.format = params.schema || 'json';
  }

  return payload;
}

/**
 * Fetch locally available models from Ollama
 */
export async function fetchOllamaModels(endpoint: string = DEFAULT_OLLAMA_ENDPOINT): Promise<string[]> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/api/tags`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Ollama server responded with status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return parseOllamaTagsResponse(data);
  } catch (error: any) {
    console.error('Failed to fetch models from Ollama:', error);
    throw new Error(`Cannot connect to Ollama at ${url}. Make sure Ollama is running ('ollama serve'). Details: ${error.message}`);
  }
}

/** Read every NDJSON frame and require a successful terminal record. Partial text is never success. */
export async function readOllamaCompletion(response: Response): Promise<string> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Ollama request failed [${response.status}]: ${detail || response.statusText}`);
  }
  let content = '';
  let completed = false;
  const consume = (frame: any) => {
    if (frame.error) throw new Error(`Ollama stream error: ${frame.error}`);
    if (completed) throw new Error('Ollama sent content after the terminal record.');
    const text = frame.message?.content ?? frame.response ?? '';
    if (typeof text !== 'string') throw new Error('Malformed Ollama content.');
    content += text;
    if (frame.done) {
      if (['length', 'max_tokens'].includes(frame.done_reason)) throw new Error('Ollama output reached its token limit; the incomplete response was rejected.');
      completed = true;
    }
  };
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { buffer += decoder.decode(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) if (line.trim()) consume(JSON.parse(line));
      }
      if (buffer.trim()) consume(JSON.parse(buffer));
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  } else consume(await response.json());
  if (!completed) throw new Error('Ollama stream ended without a completion record. No partial prose was accepted.');
  const prose = stripThinking(content);
  if (!prose) throw new Error('Ollama returned no final content.');
  return prose;
}

/** Stream transport prevents proxy inactivity; fallback is only for unsupported chat endpoints. */
export async function generateOllamaText(
  prompt: string, systemInstruction?: string, schema?: object, temperature = 0.7,
  model = DEFAULT_OLLAMA_MODEL, endpoint = DEFAULT_OLLAMA_ENDPOINT,
  maxTokens?: number, topP?: number, topK?: number, think = false
): Promise<string> {
  const base = endpoint.replace(/\/+$/, '');
  // Thinking is off unless the caller's provider role enables it; only message.content is ever read.
  // Suppressing reasoning in the prompt would defeat a role that deliberately enables thinking.
  const system = `${systemInstruction || ''}${think ? '' : '\nDo not output reasoning or thinking; return only the requested final answer.'}${schema ? `\nReturn one JSON object matching this schema: ${JSON.stringify(schema)}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Ollama request exceeded the 15 minute deadline.')), 900000);
  try {
    let response = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        stream: true, think, ...(schema ? { format: schema } : {}),
        options: { temperature, ...(maxTokens !== undefined ? { num_predict: maxTokens } : {}),
          ...(topP !== undefined ? { top_p: topP } : {}), ...(topK !== undefined ? { top_k: topK } : {}) } }),
    });
    if (response.status === 404 || response.status === 405) {
      await response.body?.cancel();
      response = await fetch(`${base}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(buildOllamaGeneratePayload({ model, prompt, system, temperature, schema, isJson: Boolean(schema), stream: true, think, maxTokens, topP, topK })),
      });
    }
    return await readOllamaCompletion(response);
  } finally { clearTimeout(timeout); }
}

export async function generateOllamaTextStream(
  prompt: string, onChunk: (chunk: string) => void, systemInstruction?: string,
  model = DEFAULT_OLLAMA_MODEL, endpoint = DEFAULT_OLLAMA_ENDPOINT
): Promise<string> {
  const text = await generateOllamaText(prompt, systemInstruction, undefined, 0.7, model, endpoint);
  // Expose only verified final content; transport thinking and partial output stay out of the manuscript.
  onChunk(text);
  return text;
}

export const DEFAULT_OLLAMA_EMBEDDING_MODEL = 'qwen3-embedding:4b';

/**
 * Embeddings for measured prose checks. Batched in one request; a short or ragged response is an
 * error rather than a silent partial result, because a missing vector would read as "no repetition".
 */
export async function embedOllama(
  inputs: string[], model = DEFAULT_OLLAMA_EMBEDDING_MODEL, endpoint = DEFAULT_OLLAMA_ENDPOINT,
): Promise<number[][]> {
  if (!inputs.length) return [];
  const base = endpoint.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Ollama embedding request exceeded the 5 minute deadline.')), 300000);
  try {
    const response = await fetch(`${base}/api/embed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model, input: inputs }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama embedding request failed [${response.status}]: ${detail || response.statusText}`);
    }
    const data = await response.json();
    const vectors = data?.embeddings;
    if (!Array.isArray(vectors) || vectors.length !== inputs.length
      || vectors.some((vector: unknown) => !Array.isArray(vector) || !vector.length || vector.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new Error(`Ollama returned no usable embeddings for ${inputs.length} input(s) from ${model}.`);
    }
    return vectors as number[][];
  } finally { clearTimeout(timeout); }
}
