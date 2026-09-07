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
  format?: 'json';
  think?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

export function parseOllamaTagsResponse(data: any): string[] {
  if (!data || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.map((m: any) => m.name || m.model).filter(Boolean);
}

export function buildOllamaGeneratePayload(params: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  isJson?: boolean;
  stream?: boolean;
  think?: boolean;
}): OllamaGeneratePayload {
  const payload: OllamaGeneratePayload = {
    model: params.model || DEFAULT_OLLAMA_MODEL,
    prompt: params.prompt,
    stream: params.stream ?? false,
    think: params.think ?? false, // Explicitly disable thinking mode for all models
    options: {
      temperature: params.temperature ?? 0.7
    }
  };

  const antiThinkingPrompt = "Do not output thinking, inner monologue, reasoning steps, or <think> tags. Output only direct final response.";
  if (params.system) {
    payload.system = `${params.system}\n\n${antiThinkingPrompt}`;
  } else {
    payload.system = antiThinkingPrompt;
  }

  if (params.isJson) {
    payload.format = 'json';
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

/**
 * Generate completion using local Ollama model
 */
export async function generateOllamaText(
  prompt: string,
  systemInstruction?: string,
  schema?: object,
  temperature: number = 0.7,
  model: string = DEFAULT_OLLAMA_MODEL,
  endpoint: string = DEFAULT_OLLAMA_ENDPOINT
): Promise<string> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/api/generate`;

  const payload = buildOllamaGeneratePayload({
    model,
    prompt,
    system: systemInstruction,
    temperature,
    isJson: Boolean(schema),
    stream: false,
    think: false
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Ollama generation failed [${response.status}]: ${errText || response.statusText}`);
  }

  const result = await response.json();
  const raw = result.response || '';
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Stream text generation using local Ollama model with thinking suppressed
 */
export async function generateOllamaTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  model: string = DEFAULT_OLLAMA_MODEL,
  endpoint: string = DEFAULT_OLLAMA_ENDPOINT
): Promise<string> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/api/generate`;

  const payload = buildOllamaGeneratePayload({
    model,
    prompt,
    system: systemInstruction,
    stream: true,
    think: false
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Ollama stream failed [${response.status}]: ${errText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';
  let insideThinkTag = false;

  const processChunk = (text: string) => {
    let current = text;
    while (current.length > 0) {
      if (insideThinkTag) {
        const closeIdx = current.indexOf('</think>');
        if (closeIdx !== -1) {
          insideThinkTag = false;
          current = current.slice(closeIdx + 8);
        } else {
          break;
        }
      } else {
        const openIdx = current.indexOf('<think>');
        if (openIdx !== -1) {
          const before = current.slice(0, openIdx);
          if (before) {
            fullText += before;
            onChunk(before);
          }
          insideThinkTag = true;
          current = current.slice(openIdx + 7);
        } else {
          fullText += current;
          onChunk(current);
          break;
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.response) {
          processChunk(parsed.response);
        }
      } catch {
        // Skip malformed chunk
      }
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim());
      if (parsed.response) {
        processChunk(parsed.response);
      }
    } catch {
      // Ignore
    }
  }

  return fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
